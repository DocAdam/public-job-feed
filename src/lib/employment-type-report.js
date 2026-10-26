const { ensureEmploymentType, displayEmploymentType, TERMS } = require("./employment-type");
const { SIMPLE_PUBLIC_HEADERS } = require("./simple-public-export");
function columnLetter(count) {
  let result = "";
  while (count > 0) { count -= 1; result = String.fromCharCode(65 + count % 26) + result; count = Math.floor(count / 26); }
  return result;
}
function sheetRange(headers, rows) { return `A1:${columnLetter(headers.length)}${rows + 1}`; }
function employmentCoverage(rows, simple = false) {
  const result = { denominator: rows.length, statedSchedule: 0, statedTerms: 0, neither: 0, conflicts: 0, byATS: {}, byLabel: {} };
  for (const row of rows) {
    const fields = simple ? null : ensureEmploymentType(row);
    const label = simple ? row["Employment Type"] : displayEmploymentType(row);
    const parts = String(label).split("; ");
    const schedule = fields ? (fields.EmploymentSchedule !== "Not stated" || fields.EmploymentTypeEvidence.some(e => e.Dimension === "schedule")) : parts.some(p => ["Full-time", "Part-time", "Full-time or Part-time", "Variable"].includes(p));
    const terms = fields ? fields.EmploymentTerms.length > 0 : parts.some(p => TERMS.includes(p));
    result.statedSchedule += Number(schedule);
    result.statedTerms += Number(terms);
    result.neither += Number(!schedule && !terms && label !== "Needs review");
    result.conflicts += Number(label === "Needs review");
    const ats = row.ATS || row.Source || "Unknown";
    result.byATS[ats] ||= { denominator: 0, byLabel: {} };
    result.byATS[ats].denominator += 1;
    result.byATS[ats].byLabel[label] = (result.byATS[ats].byLabel[label] || 0) + 1;
    result.byLabel[label] = (result.byLabel[label] || 0) + 1;
  }
  return result;
}
function employmentImportNotes(rowCount) {
  const range = sheetRange(SIMPLE_PUBLIC_HEADERS, rowCount);
  return `# Employment Type import instructions\n\nThis package does not publish to Google Sheets.\n\nThe public table has ${rowCount} data rows and ${SIMPLE_PUBLIC_HEADERS.length} columns. Use \`01_good_documentation_jobs!${range}\` for the main table, its filter, and the source range of remote_jobs_pivot. Check the range again if rows change before import. Preserve the remote view and its current Work Arrangement filter.\n\nEmployment Type is the last column (${columnLetter(SIMPLE_PUBLIC_HEADERS.length)}). It gives the stated schedule first, then employment terms. Examples: \`Full-time\`, \`Contract\`, \`Part-time; Contract\`, and \`Full-time; Internship\`. Each code example is one complete cell value.\n\nUse Filter by condition > Text contains > Contract to include Contract and Part-time; Contract. Use Text contains > Internship to include Full-time; Internship. An exact-value filter selects only that complete cell label.\n\nNot stated means no supported schedule or terms. Needs review means conflicting evidence. A known schedule does not require known terms. Full-time does not mean Permanent. Role Type and Work Arrangement keep their existing meanings.\n\nBefore an approved import, inspect public-schema.json and employment-type-coverage.json. The counts for schedules and terms can overlap. Each population gives its own denominator. Conflicts retain evidence in the detailed JSON and CSV. Simple CSV files do not contain internal evidence.\n`;
}
// Called only by the existing pruning workflow, after its saved backup is made.
// Historical packages without a schema marker retain their old behavior.
async function updateAfterPublicPrune(inputPath, headers, rows) {
  const fs = require("node:fs/promises"), path = require("node:path");
  const { parseCsvRecords, rowsToCsv } = require("./csv");
  const directory = path.dirname(inputPath), schemaPath = path.join(directory, "public-schema.json");
  let schema;
  try { schema = JSON.parse(await fs.readFile(schemaPath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
  if (schema.schemaVersion !== 2) throw new Error("Unsupported public schema during URL pruning");
  if (JSON.stringify(headers) !== JSON.stringify(SIMPLE_PUBLIC_HEADERS)) throw new Error("Public headers do not match schema 2 during URL pruning");
  schema.rowCount = rows.length;
  schema.tableRange = sheetRange(headers, rows.length);
  const coveragePath = path.join(directory, "employment-type-coverage.json");
  const coverage = JSON.parse(await fs.readFile(coveragePath, "utf8"));
  coverage.public = employmentCoverage(rows, true);
  coverage.tableRange = schema.tableRange;
  coverage.publicAfterURLPruning = true;
  const changed = [path.basename(inputPath), "00_start_here.csv", "public-schema.json", "employment-type-coverage.json", "EMPLOYMENT_TYPE_IMPORT.md"];
  if (schema.formulaFileName) {
    if (path.basename(schema.formulaFileName) !== schema.formulaFileName) throw new Error("Invalid formula file name");
    const formulaPath = path.join(directory, schema.formulaFileName);
    const parsed = parseCsvRecords(await fs.readFile(formulaPath, "utf8"));
    const links = new Set(rows.map(row => row["Apply Link"]));
    const kept = parsed.rows.filter(row => {
      const match = String(row.Apply || "").match(/^=HYPERLINK\("((?:""|[^"])*)","Apply"\)$/);
      return match && links.has(match[1].replace(/""/g, '"'));
    });
    if (kept.length !== rows.length) throw new Error("Formula rows do not match pruned public rows");
    await fs.writeFile(formulaPath, rowsToCsv(parsed.headers, kept));
    changed.push(schema.formulaFileName);
  }
  await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2) + "\n");
  await fs.writeFile(coveragePath, JSON.stringify(coverage, null, 2) + "\n");
  await fs.writeFile(path.join(directory, "EMPLOYMENT_TYPE_IMPORT.md"), employmentImportNotes(rows.length));
  const manifestPath = path.join(directory, "gsheet-package-manifest.json");
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return true; throw error; }
  for (const entry of manifest) if (changed.includes(entry.FileName)) entry.SizeBytes = (await fs.stat(path.join(directory, entry.FileName))).size;
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const csvPath = path.join(directory, "gsheet-package-manifest.csv");
  let oldHeaders = [];
  try { oldHeaders = parseCsvRecords(await fs.readFile(csvPath, "utf8")).headers; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.writeFile(csvPath, require("./package-manifest").manifestCsv(manifest, oldHeaders));
  return true;
}

module.exports = { columnLetter, sheetRange, employmentCoverage, employmentImportNotes, updateAfterPublicPrune };
