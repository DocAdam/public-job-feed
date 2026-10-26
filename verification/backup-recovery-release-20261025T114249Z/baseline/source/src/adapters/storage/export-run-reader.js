const path = require("path");
const Database = require("better-sqlite3");

class ExportRunReader {
  constructor(runDir) {
    this.db = new Database(path.join(runDir, "run-store.sqlite"), { readonly: true });
  }

  *iterateRawSlice(sliceName) {
    const statement = this.db.prepare(`
      SELECT r.row_json
      FROM slice_memberships m JOIN rows r ON r.id = m.row_id
      WHERE m.slice_name = ? ORDER BY m.membership_sequence
    `);
    for (const row of statement.iterate(sliceName)) yield JSON.parse(row.row_json);
  }

  *iterateSelectedSlice(sliceName) {
    const statement = this.db.prepare(`
      SELECT s.row_json
      FROM selected_rows s
      JOIN dedupe_components winner
        ON winner.slice_name = s.slice_name AND winner.row_id = s.row_id
      JOIN dedupe_components member
        ON member.slice_name = winner.slice_name AND member.component_id = winner.component_id
      JOIN dedupe_memberships membership
        ON membership.slice_name = member.slice_name AND membership.row_id = member.row_id
      WHERE s.slice_name = ?
      GROUP BY s.row_id
      ORDER BY MIN(membership.membership_sequence)
    `);
    for (const row of statement.iterate(sliceName)) yield JSON.parse(row.row_json);
  }

  *iterateDedupeDecisions() {
    const statement = this.db.prepare(`
      SELECT decision_json FROM dedupe_decisions
      ORDER BY slice_name, component_id
    `);
    for (const row of statement.iterate()) yield JSON.parse(row.decision_json);
  }

  *iterateDedupeDecisionsForSlice(sliceName) {
    const statement = this.db.prepare(`
      SELECT d.decision_json
      FROM dedupe_decisions d
      JOIN dedupe_components c ON c.slice_name = d.slice_name AND c.component_id = d.component_id
      JOIN dedupe_memberships m ON m.slice_name = c.slice_name AND m.row_id = c.row_id
      WHERE d.slice_name = ?
      GROUP BY d.component_id
      ORDER BY MIN(m.membership_sequence)
    `);
    for (const row of statement.iterate(sliceName)) yield JSON.parse(row.decision_json);
  }

  getSliceSummary(sliceName) {
    const row = this.db.prepare(`
      SELECT m.*,
        (SELECT COUNT(*) FROM slice_companies c WHERE c.slice_name = m.slice_name) AS unique_companies,
        (SELECT COUNT(*) FROM slice_titles t WHERE t.slice_name = m.slice_name) AS unique_titles
      FROM slice_metrics m WHERE m.slice_name = ?
    `).get(sliceName);
    return row || {
      rows: 0, unique_companies: 0, unique_titles: 0, writer_fit_a: 0, writer_fit_b: 0,
      writer_fit_c: 0, remote_rows: 0, us_remote_eligible_rows: 0, salary_detected_rows: 0,
      review_rows: 0, duplicate_rows: 0, guardrail_rows: 0, penalty_rows: 0, demoted_rows: 0,
    };
  }

  getDedupeSummary(sliceName) {
    const input = this.db.prepare("SELECT COUNT(*) AS count FROM dedupe_memberships WHERE slice_name = ?").get(sliceName).count;
    const output = this.db.prepare("SELECT COUNT(*) AS count FROM selected_rows WHERE slice_name = ?").get(sliceName).count;
    const groups = this.db.prepare("SELECT COUNT(*) AS count FROM dedupe_components WHERE slice_name = ? AND group_size > 1 GROUP BY component_id").all(sliceName).length;
    return { input, output, groups };
  }

  close() {
    this.db.close();
  }
}

module.exports = { ExportRunReader };
