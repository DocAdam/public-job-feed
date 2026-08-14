const { parentPort } = require("worker_threads");
const Database = require("better-sqlite3");
const {
  buildSelectionReason,
  compareRows,
  summarizeRejectedRows,
} = require("../exports/export-dedupe");

let db;
let writeDb;
let databasePath;

function isTrue(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

function compareTopRows(a, b) {
  function compareText(leftValue, rightValue) {
    const left = String(leftValue || "").toLowerCase();
    const right = String(rightValue || "").toLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  return (
    (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0) ||
    (Number(a.TitleReviewPriority) || 999) - (Number(b.TitleReviewPriority) || 999) ||
    Number(isTrue(b.USRemoteEligible)) - Number(isTrue(a.USRemoteEligible)) ||
    Number(isTrue(b.SalaryDetected)) - Number(isTrue(a.SalaryDetected)) ||
    compareText(a.Company, b.Company) ||
    compareText(a.Title, b.Title)
  );
}

function assertReady() {
  if (!db) throw new Error("Run store is not initialized");
}

function initialize({ dbPath }) {
  db = new Database(dbPath);
  databasePath = dbPath;
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -16384");
  db.pragma("temp_store = FILE");
  db.pragma("mmap_size = 0");
  writeDb = new Database(dbPath);
  writeDb.pragma("journal_mode = WAL");
  writeDb.pragma("synchronous = NORMAL");
  writeDb.pragma("cache_size = -16384");
  writeDb.pragma("temp_store = FILE");
  writeDb.pragma("mmap_size = 0");
  db.exec(`
    CREATE TABLE run_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE rows (
      id INTEGER PRIMARY KEY,
      source_sequence INTEGER NOT NULL UNIQUE,
      row_json TEXT NOT NULL
    );
    CREATE TABLE slice_memberships (
      slice_name TEXT NOT NULL,
      row_id INTEGER NOT NULL,
      membership_sequence INTEGER NOT NULL,
      PRIMARY KEY (slice_name, row_id)
    );
    CREATE TABLE dedupe_keys (
      slice_name TEXT NOT NULL,
      row_id INTEGER NOT NULL,
      dedupe_key TEXT NOT NULL,
      PRIMARY KEY (slice_name, row_id, dedupe_key)
    );
    CREATE TABLE dedupe_memberships (
      slice_name TEXT NOT NULL,
      row_id INTEGER NOT NULL,
      membership_sequence INTEGER NOT NULL,
      PRIMARY KEY (slice_name, row_id)
    );
    CREATE TABLE dedupe_components (
      slice_name TEXT NOT NULL,
      row_id INTEGER NOT NULL,
      component_id INTEGER NOT NULL,
      group_size INTEGER NOT NULL,
      PRIMARY KEY (slice_name, row_id)
    );
    CREATE TABLE selected_rows (
      slice_name TEXT NOT NULL,
      row_id INTEGER NOT NULL,
      membership_sequence INTEGER NOT NULL,
      group_size INTEGER NOT NULL,
      row_json TEXT NOT NULL,
      PRIMARY KEY (slice_name, row_id)
    );
    CREATE TABLE dedupe_decisions (
      slice_name TEXT NOT NULL,
      component_id INTEGER NOT NULL,
      decision_json TEXT NOT NULL,
      PRIMARY KEY (slice_name, component_id)
    );
    CREATE TABLE slice_metrics (
      slice_name TEXT PRIMARY KEY,
      rows INTEGER NOT NULL DEFAULT 0,
      writer_fit_a INTEGER NOT NULL DEFAULT 0,
      writer_fit_b INTEGER NOT NULL DEFAULT 0,
      writer_fit_c INTEGER NOT NULL DEFAULT 0,
      remote_rows INTEGER NOT NULL DEFAULT 0,
      us_remote_eligible_rows INTEGER NOT NULL DEFAULT 0,
      salary_detected_rows INTEGER NOT NULL DEFAULT 0,
      review_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0,
      guardrail_rows INTEGER NOT NULL DEFAULT 0,
      penalty_rows INTEGER NOT NULL DEFAULT 0,
      demoted_rows INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE slice_companies (
      slice_name TEXT NOT NULL,
      company_key TEXT NOT NULL,
      PRIMARY KEY (slice_name, company_key)
    );
    CREATE TABLE slice_titles (
      slice_name TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      PRIMARY KEY (slice_name, normalized_title)
    );
    CREATE INDEX memberships_by_slice_sequence
      ON slice_memberships(slice_name, membership_sequence);
    CREATE INDEX dedupe_keys_by_slice_key
      ON dedupe_keys(slice_name, dedupe_key, row_id);
    CREATE INDEX dedupe_memberships_by_slice_sequence
      ON dedupe_memberships(slice_name, membership_sequence);
    CREATE INDEX dedupe_components_by_slice_component
      ON dedupe_components(slice_name, component_id);
  `);
}

function initializeExisting({ dbPath }) {
  db = new Database(dbPath);
  databasePath = dbPath;
  db.pragma("journal_mode = WAL"); db.pragma("synchronous = NORMAL"); db.pragma("cache_size = -16384"); db.pragma("temp_store = FILE"); db.pragma("mmap_size = 0");
  writeDb = new Database(dbPath);
  writeDb.pragma("journal_mode = WAL"); writeDb.pragma("synchronous = NORMAL"); writeDb.pragma("cache_size = -16384"); writeDb.pragma("temp_store = FILE"); writeDb.pragma("mmap_size = 0");
}

function insertBatch({ rows, metadata }) {
  assertReady();
  const insertRow = db.prepare("INSERT INTO rows (source_sequence, row_json) VALUES (?, ?)");
  const insertMembership = db.prepare(
    "INSERT INTO slice_memberships (slice_name, row_id, membership_sequence) VALUES (?, ?, ?)"
  );
  const insertDedupeKey = db.prepare(
    "INSERT OR IGNORE INTO dedupe_keys (slice_name, row_id, dedupe_key) VALUES (?, ?, ?)"
  );
  const insertDedupeMembership = db.prepare(
    "INSERT INTO dedupe_memberships (slice_name, row_id, membership_sequence) VALUES (?, ?, ?)"
  );
  const updateMetrics = db.prepare(`
    INSERT INTO slice_metrics (
      slice_name, rows, writer_fit_a, writer_fit_b, writer_fit_c, remote_rows,
      us_remote_eligible_rows, salary_detected_rows, review_rows, duplicate_rows, guardrail_rows, penalty_rows, demoted_rows
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slice_name) DO UPDATE SET
      rows = rows + 1,
      writer_fit_a = writer_fit_a + excluded.writer_fit_a,
      writer_fit_b = writer_fit_b + excluded.writer_fit_b,
      writer_fit_c = writer_fit_c + excluded.writer_fit_c,
      remote_rows = remote_rows + excluded.remote_rows,
      us_remote_eligible_rows = us_remote_eligible_rows + excluded.us_remote_eligible_rows,
      salary_detected_rows = salary_detected_rows + excluded.salary_detected_rows,
      review_rows = review_rows + excluded.review_rows,
      duplicate_rows = duplicate_rows + excluded.duplicate_rows,
      guardrail_rows = guardrail_rows + excluded.guardrail_rows,
      penalty_rows = penalty_rows + excluded.penalty_rows,
      demoted_rows = demoted_rows + excluded.demoted_rows
  `);
  const insertCompany = db.prepare(
    "INSERT OR IGNORE INTO slice_companies (slice_name, company_key) VALUES (?, ?)"
  );
  const insertTitle = db.prepare(
    "INSERT OR IGNORE INTO slice_titles (slice_name, normalized_title) VALUES (?, ?)"
  );
  const setMetadata = db.prepare(
    "INSERT INTO run_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  db.transaction(() => {
    for (const item of rows) {
      const result = insertRow.run(item.sequence, item.rowJson);
      for (const membership of item.memberships) {
        insertMembership.run(membership.sliceName, result.lastInsertRowid, membership.sequence);
        updateMetrics.run(
          membership.sliceName,
          1,
          membership.metrics.writerFitA,
          membership.metrics.writerFitB,
          membership.metrics.writerFitC,
          membership.metrics.remote,
          membership.metrics.usRemoteEligible,
          membership.metrics.salaryDetected,
          membership.metrics.review,
          membership.metrics.duplicate,
          membership.metrics.guardrail || 0,
          membership.metrics.penalty || 0,
          membership.metrics.demoted || 0
        );
        if (membership.companyKey) insertCompany.run(membership.sliceName, membership.companyKey);
        if (membership.normalizedTitle) insertTitle.run(membership.sliceName, membership.normalizedTitle);
      }
      for (const dedupe of item.dedupeKeys) {
        insertDedupeMembership.run(dedupe.sliceName, result.lastInsertRowid, dedupe.sequence);
        for (const key of dedupe.keys) insertDedupeKey.run(dedupe.sliceName, result.lastInsertRowid, key);
      }
    }
    for (const [key, value] of Object.entries(metadata || {})) setMetadata.run(key, String(value));
  })();
}

function resolveDedupe() {
  assertReady();
  const slices = db.prepare("SELECT DISTINCT slice_name FROM dedupe_memberships ORDER BY slice_name").all();
  const updateMembershipSequence = writeDb.prepare(
    "UPDATE dedupe_memberships SET membership_sequence = ? WHERE slice_name = ? AND row_id = ?"
  );
  const topRows = db.prepare(`
    SELECT m.row_id, r.row_json
    FROM dedupe_memberships m JOIN rows r ON r.id = m.row_id
    WHERE m.slice_name = 'deduped-top'
    ORDER BY m.membership_sequence
  `).all();
  if (topRows.length > 0) {
    const orderedTopRows = topRows
      .map((entry) => ({ ...entry, row: JSON.parse(entry.row_json) }))
      .sort((left, right) => compareTopRows(left.row, right.row));
    writeDb.transaction(() => {
      orderedTopRows.forEach((entry, index) => {
        updateMembershipSequence.run(index + 1, "deduped-top", entry.row_id);
      });
    })();
  }
  const results = [];
  const insertComponent = db.prepare(
    "INSERT INTO dedupe_components (slice_name, row_id, component_id, group_size) VALUES (?, ?, ?, ?)"
  );
  const insertSelected = writeDb.prepare(
    "INSERT INTO selected_rows (slice_name, row_id, membership_sequence, group_size, row_json) VALUES (?, ?, ?, ?, ?)"
  );
  const insertDecision = writeDb.prepare(
    "INSERT INTO dedupe_decisions (slice_name, component_id, decision_json) VALUES (?, ?, ?)"
  );

  for (const { slice_name: sliceName } of slices) {
    const { maxId = 0, count = 0 } = db.prepare(
      "SELECT COALESCE(MAX(row_id), 0) AS maxId, COUNT(*) AS count FROM dedupe_memberships WHERE slice_name = ?"
    ).get(sliceName);
    const parent = new Int32Array(maxId + 1);
    const size = new Int32Array(maxId + 1);
    const membershipSequence = new Int32Array(maxId + 1);
    const maximumSequence = new Int32Array(maxId + 1);
    for (const { row_id: rowId, membership_sequence: sequence } of db.prepare(
      "SELECT row_id, membership_sequence FROM dedupe_memberships WHERE slice_name = ?"
    ).iterate(sliceName)) {
      parent[rowId] = rowId;
      membershipSequence[rowId] = sequence;
    }
    const find = (value) => {
      let root = value;
      while (parent[root] !== root) root = parent[root];
      while (value !== root) {
        const next = parent[value];
        parent[value] = root;
        value = next;
      }
      return root;
    };
    let key = "";
    let anchor = 0;
    for (const entry of db.prepare(
      "SELECT dedupe_key, row_id FROM dedupe_keys WHERE slice_name = ? ORDER BY dedupe_key, row_id"
    ).iterate(sliceName)) {
      if (entry.dedupe_key !== key) {
        key = entry.dedupe_key;
        anchor = entry.row_id;
      } else {
        const left = find(anchor);
        const right = find(entry.row_id);
        if (left !== right) parent[right] = left;
      }
    }
    for (let rowId = 1; rowId <= maxId; rowId += 1) {
      if (parent[rowId] === 0) continue;
      const root = find(rowId);
      size[root] += 1;
      maximumSequence[root] = Math.max(maximumSequence[root], membershipSequence[rowId]);
    }

    db.transaction(() => {
      for (let rowId = 1; rowId <= maxId; rowId += 1) {
        if (parent[rowId] === 0) continue;
        const root = find(rowId);
        insertComponent.run(sliceName, rowId, maximumSequence[root] - 1, size[root]);
      }
    })();

    let currentComponent = null;
    let selected;
    let selectedWrites = 0;
    const persistSelected = (candidate) => {
      const output = { ...candidate.row, DedupeSelected: true, DedupeSelectionReason: buildSelectionReason(candidate.row, candidate.groupSize), DedupeGroupSize: candidate.groupSize };
      insertSelected.run(sliceName, candidate.rowId, candidate.membershipSequence, candidate.groupSize, JSON.stringify(output));
      selectedWrites += 1;
      if (selectedWrites % 10000 === 0) {
        writeDb.exec("COMMIT");
        writeDb.exec("BEGIN");
      }
    };
    writeDb.exec("BEGIN");
    for (const entry of db.prepare(`
      SELECT c.component_id, c.group_size, m.row_id, m.membership_sequence, r.row_json
      FROM dedupe_components c
      JOIN dedupe_memberships m ON m.slice_name = c.slice_name AND m.row_id = c.row_id
      JOIN rows r ON r.id = c.row_id
      WHERE c.slice_name = ?
      ORDER BY c.component_id, m.membership_sequence
    `).iterate(sliceName)) {
      if (currentComponent !== null && entry.component_id !== currentComponent) {
        persistSelected(selected);
        selected = undefined;
      }
      currentComponent = entry.component_id;
      const candidate = { row: JSON.parse(entry.row_json), rowId: entry.row_id, membershipSequence: entry.membership_sequence, groupSize: entry.group_size };
      if (!selected || compareRows(candidate.row, selected.row) < 0) selected = candidate;
    }
    if (selected) {
      persistSelected(selected);
    }
    writeDb.exec("COMMIT");

    let component = null;
    let winner;
    let groupSize = 0;
    let rejected = [];
    writeDb.exec("BEGIN");
    for (const entry of db.prepare(`
      SELECT c.component_id, c.group_size, c.row_id, m.membership_sequence, r.row_json, s.row_id AS selected_id, s.row_json AS selected_json
      FROM dedupe_components c
      JOIN rows r ON r.id = c.row_id
      JOIN dedupe_memberships m ON m.slice_name = c.slice_name AND m.row_id = c.row_id
      JOIN dedupe_components selected_component
        ON selected_component.slice_name = c.slice_name
        AND selected_component.component_id = c.component_id
      JOIN selected_rows s
        ON s.slice_name = selected_component.slice_name
        AND s.row_id = selected_component.row_id
      WHERE c.slice_name = ?
      ORDER BY c.component_id, c.row_id
    `).iterate(sliceName)) {
      if (component !== null && entry.component_id !== component && groupSize > 1) {
        const rejectedRows = rejected.sort((a, b) => compareRows(a.row, b.row) || a.sequence - b.sequence).map((entry) => entry.row);
        const decision = { SliceName: sliceName, DuplicateGroupKey: component, DedupeGroupSize: groupSize, SelectedCompany: winner.Company, SelectedTitle: winner.Title, SelectedATS: winner.ATS, SelectedURL: winner.URL, SelectedWriterFitScore: winner.WriterFitScore, SelectedWriterFitTier: winner.WriterFitTier, SelectionReason: winner.DedupeSelectionReason, RejectedRowsSummary: summarizeRejectedRows(rejectedRows) };
        insertDecision.run(sliceName, component, JSON.stringify(decision));
        rejected = [];
      }
      component = entry.component_id;
      groupSize = entry.group_size;
      winner = JSON.parse(entry.selected_json);
      if (entry.row_id !== entry.selected_id) rejected.push({ row: JSON.parse(entry.row_json), sequence: entry.membership_sequence });
    }
    if (component !== null && groupSize > 1) {
      const rejectedRows = rejected.sort((a, b) => compareRows(a.row, b.row) || a.sequence - b.sequence).map((entry) => entry.row);
      const decision = { SliceName: sliceName, DuplicateGroupKey: component, DedupeGroupSize: groupSize, SelectedCompany: winner.Company, SelectedTitle: winner.Title, SelectedATS: winner.ATS, SelectedURL: winner.URL, SelectedWriterFitScore: winner.WriterFitScore, SelectedWriterFitTier: winner.WriterFitTier, SelectionReason: winner.DedupeSelectionReason, RejectedRowsSummary: summarizeRejectedRows(rejectedRows) };
      insertDecision.run(sliceName, component, JSON.stringify(decision));
    }
    writeDb.exec("COMMIT");
    results.push({ sliceName, inputRows: count, outputRows: db.prepare("SELECT COUNT(*) AS count FROM selected_rows WHERE slice_name = ?").get(sliceName).count });
  }
  return results;
}

function recomputeDedupe() {
  assertReady();
  writeDb.exec("DELETE FROM dedupe_decisions; DELETE FROM selected_rows; DELETE FROM dedupe_components;");
  return resolveDedupe();
}

function getSummary() {
  assertReady();
  const metrics = db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM slice_companies c WHERE c.slice_name = m.slice_name) AS unique_companies,
      (SELECT COUNT(*) FROM slice_titles t WHERE t.slice_name = m.slice_name) AS unique_titles
    FROM slice_metrics m
    ORDER BY m.slice_name
  `).all();
  const totalRows = db.prepare("SELECT COUNT(*) AS count FROM rows").get().count;
  return { totalRows, metrics };
}

function close() {
  if (db) {
    db.close();
    db = undefined;
  }
  if (writeDb) {
    writeDb.close();
    writeDb = undefined;
  }
}

parentPort.on("message", ({ id, method, params }) => {
  try {
    let result;
    if (method === "initialize") result = initialize(params);
    else if (method === "initializeExisting") result = initializeExisting(params);
    else if (method === "insertBatch") result = insertBatch(params);
    else if (method === "getSummary") result = getSummary();
    else if (method === "resolveDedupe") result = resolveDedupe();
    else if (method === "recomputeDedupe") result = recomputeDedupe();
    else if (method === "close") result = close();
    else throw new Error(`Unknown run store method: ${method}`);
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: { message: error.message, stack: error.stack } });
  }
});
