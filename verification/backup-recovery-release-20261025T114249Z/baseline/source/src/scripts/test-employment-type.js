const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parseCsvRecords, rowsToCsv } = require("../lib/csv");
const { extractEmploymentType, displayEmploymentType, validateEmploymentType } = require("../lib/employment-type");
const normalize = require("../lib/jobs-normalize");
const { buildJobExportArtifacts, publicFeedHeaders, toCsvRows } = require("../lib/job-export");
const root = path.join(__dirname, "fixtures/employment-type");
const load = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const review = parseCsvRecords(fs.readFileSync(path.join(root, "employment-type-sample-review.csv"), "utf8")).rows;
assert.equal(review.length, 18);
for (const entry of load("provenance.json").files) assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root, entry.file))).digest("hex"), entry.sha256);
const context = { ats: "ashby", company: "Test", companyKey: "test", fetchedAt: "2026-10-23T14:00:00Z", fetchUrl: "https://example.com/api" };
function check(ats, raw, expected) {
  const fields = extractEmploymentType(raw, { ATS: ats, Title: "Writer", URL: "https://example.com/job", FetchedAt: context.fetchedAt }, { ...context, ats });
  assert.equal(displayEmploymentType(fields), expected);
  assert.deepEqual(validateEmploymentType(fields), []);
  return fields;
}
check("ashby", { employmentType: "Intern" }, "Internship");
check("lever", { categories: { commitment: "Temporary" } }, "Temporary");
check("lever", { categories: { commitment: "Contract" } }, "Contract");
check("lever", { categories: { commitment: "Full time" } }, "Full-time");
check("bamboohr", { employmentType: null, employmentStatusLabel: "Permanent, Full-Time" }, "Full-time; Permanent");
check("workday", { timeType: "Part time", workerType: "Contractor" }, "Part-time; Contract");
check("workday", { similarJobs: [{ timeType: "Full time" }], facets: [{ descriptor: "Full time" }] }, "Not stated");
check("icims", { Type: "Union", employmentType: "OTHER" }, "Not stated");
check("ashby", { employmentType: "Full-time or Part-time" }, "Full-time or Part-time");
assert.equal(check("ashby", { employmentType: "Fellowship" }, "Not stated").EmploymentTypeEvidence[0].RawValue, "Fellowship");
check("greenhouse", { metadata: [{ name: "Employment Type", value: "Contract" }, { name: "Department", value: "Full time" }] }, "Contract");
const row = normalize.normalizeBambooHRJob({ id: 1, jobOpeningName: "Technical Writer", employmentStatusLabel: "Contractor" }, context, []);
const exported = buildJobExportArtifacts([row], [], [], "2026-10-24T00:00:00Z").publicFeedRows;
assert.equal(exported[0].EmploymentTerms[0], "Contract");
assert.equal(exported[0].EmploymentTypeEvidence[0].ObservedAt, context.fetchedAt);
const csv = parseCsvRecords(rowsToCsv(publicFeedHeaders, toCsvRows(exported))).rows[0];
assert.deepEqual(JSON.parse(csv.EmploymentTypeEvidence), exported[0].EmploymentTypeEvidence);
assert.deepEqual(JSON.parse(csv.EmploymentTerms), ["Contract"]);
assert.deepEqual(validateEmploymentType({}), []);
console.log("PASS: 18-case evidence index, checksums, structured extraction, normalization, canonical projection, CSV evidence, old records.");

// These 18 cases use retained review excerpts. Detail-only values are not collector coverage.
const functions = { ashby: "normalizeAshbyJob", greenhouse: "normalizeGreenhouseJob", lever: "normalizeLeverJob", workday: "normalizeWorkdayJob", bamboohr: "normalizeBambooHRJob", icims: "normalizeICIMSJob" };
const boardExpected = ["Full-time; Internship", "Full-time", "Full-time", "Contract", "Contract", "Full-time", "Temporary", "Contract", "Full-time", "Contract", "Not stated", "Full-time; Internship", "Part-time; Contract; Freelance", "Contract", "Full-time; Permanent", "Part-time", "Not stated", "Not stated"];
const sampleRows = [];
for (const item of review) {
  const n = Number(item.Sample), prefix = String(n).padStart(2, "0");
  let raw;
  if (item.ATS === "workday") raw = load(`${prefix}-workday-search.body`).jobPostings[0];
  else if (item.ATS === "icims") {
    // Derived board-level test: saved normalized title/description only. No detail fields.
    const saved = load("selected.json").find(r => r.URL === item.JobURL);
    assert.ok(saved, `Missing saved sample ${n}`);
    raw = { id: saved.RawJobId, title: saved.Title, description: saved.Description, url: saved.URL };
  } else raw = load(`${prefix}-${item.ATS}-selected-source.json`);
  const search = item.ATS === "workday" ? load("workday-search-requests.json").find(request => request.name === `${prefix}-workday-search`) : null;
  const row = normalize[functions[item.ATS]](raw, { ats: item.ATS, company: item.Company, companyKey: item.Company.toLowerCase(), fetchedAt: search ? search.checkedAt : item.ATS === "icims" ? item.SavedFetchedAt : item.CheckedAt, fetchUrl: search ? search.url : item.DataURL, boardUrl: item.JobURL.split("/job/")[0] }, []);
  assert.equal(displayEmploymentType(row), boardExpected[n - 1], `Sample ${n}`);
  assert.deepEqual(validateEmploymentType(row), [], `Sample ${n} schema`);
  sampleRows.push(row);
}
function textCheck(title, description, expected, raw = {}, ats = "greenhouse") {
  const fields = extractEmploymentType(raw, { ATS: ats, Title: title, Description: description, FetchedAt: context.fetchedAt, URL: "https://example.com/job" });
  assert.equal(displayEmploymentType(fields), expected, `${title}: ${description}`);
  return fields;
}
textCheck("Technical Writer — Contract", "", "Contract");
textCheck("Technical Writer", "Employment Type: <b>Full Time</b>", "Full-time");
textCheck("Technical Writer", "This is a six-month contract position.", "Contract");
textCheck("Technical Writer", "This role is full-time or part-time.", "Full-time or Part-time");
textCheck("Technical Writer", "Employment Type: Full-time / Part-time", "Full-time or Part-time");
textCheck("Technical Writer", "This position is a variable schedule role.", "Variable");
textCheck("Technical Writer", "Schedule: Part&#160;Time", "Part-time");
textCheck("Technical Writer", "Employment Type: Part Time", "Part-time", { Type: "Union", employmentType: "OTHER" }, "icims");
textCheck("Technical Writer", "This is a contract position.", "Needs review", { metadata: [{ name: "Employment Type", value: "Permanent" }] });
textCheck("Technical Writer", "Employment Type: Part-time", "Needs review", { metadata: [{ name: "Employment Type", value: "Full-time" }] });
for (const passage of [
  "Contract management and review legal contracts.", "Prior internship experience is required.",
  "Possible future conversion to full-time employment.", "Would you prefer full-time or part-time?",
  "Full-time employees receive benefits.", "This role is not full-time.", "This is not a contract position.",
  "We also have another job. A full-time writer is needed in that team.", "This position may convert to full-time.",
  "This role is a contract management position.", "This role is full-time eligible for benefits.",
]) textCheck("Technical Writer", passage, "Not stated");
textCheck("Contract Management Specialist", "", "Not stated");
const old = { Title: "Technical Writer (Contract)", FetchedAt: "2020-01-01T00:00:00Z", Description: "" };
assert.equal(displayEmploymentType(old), "Contract");
assert.equal(require("../lib/employment-type").ensureEmploymentType(old).EmploymentTypeEvidence[0].ObservedAt, old.FetchedAt);
console.log("PASS: all 18 board-level cases, explicit text, alternatives, conflicts, HTML, dates, and negative contexts.");
module.exports = { sampleRows };

const { selectDedupedRows } = require("../lib/dedupe-select");
const { addDedupeFields } = require("../lib/job-dedupe");
const { buildSimplePublicRow, buildSimpleFormulaRow } = require("../lib/simple-public-export");
const { groupPublicSheetCountryPostings } = require("./build-gsheet-package");
function duplicate(label, url, location = "US") {
  return { ...normalize.normalizeAshbyJob({ id: url, title: "Technical Writer", employmentType: label, location, jobUrl: url }, context, []), DuplicateGroupKey: "same-title-location", CanonicalURLKey: url, WriterFitScore: 85 };
}
const variants = [duplicate("Contract", "https://example.com/a"), duplicate("Permanent", "https://example.com/b"), duplicate(null, "https://example.com/c")];
assert.equal(selectDedupedRows(variants, "test").rows.length, 3);
const conflictRows = [variants[0], { ...duplicate("Permanent", variants[0].URL), RawJobId: variants[0].RawJobId }];
const conflictSelected = selectDedupedRows(conflictRows, "test").rows;
assert.equal(conflictSelected.length, 1);
assert.equal(displayEmploymentType(conflictSelected[0]), "Needs review");
assert.ok(conflictSelected[0].EmploymentTypeEvidence.some(e => e.Value === "Contract"));
assert.ok(conflictSelected[0].EmploymentTypeEvidence.some(e => e.Value === "Permanent"));
// A contradictory posting must not bridge two separate postings through a weak key.
assert.equal(selectDedupedRows([...conflictRows, variants[1]], "test").rows.length, 2);
const groupedInput = [variants[0], { ...duplicate("Contract", "https://example.com/d", "Canada") }].map(r => buildSimplePublicRow(r, context.fetchedAt));
const grouped = groupPublicSheetCountryPostings(groupedInput);
assert.equal(grouped.length, 1);
assert.match(grouped[0].Location, /Canada; US/);
assert.equal(grouped[0]["Additional Apply Links"], "https://example.com/a");
assert.equal(groupPublicSheetCountryPostings([variants[0], { ...variants[1], Location: "Canada" }].map(r => buildSimplePublicRow(r, context.fetchedAt))).length, 2);
assert.equal(groupPublicSheetCountryPostings([conflictSelected[0], { ...conflictSelected[0], Location: "Canada" }].map(r => buildSimplePublicRow(r, context.fetchedAt))).length, 2);
for (const row of sampleRows) assert.equal(buildSimpleFormulaRow(row, context.fetchedAt)["Employment Type"], buildSimplePublicRow(row, context.fetchedAt)["Employment Type"]);
for (const row of variants) assert.equal(addDedupeFields([row])[0].JobKey, addDedupeFields([{ ...row, EmploymentSchedule: undefined, EmploymentTerms: undefined, EmploymentTypeEvidence: undefined, EmploymentTypeStatus: undefined }])[0].JobKey);
console.log("PASS: employment variants, same-posting conflict evidence, bridge protection, location links, formula parity, stable identity keys.");
textCheck("Technical Writer", "This is a full-time 40-hour-a-week contract position, Monday through Friday.", "Full-time; Contract");
textCheck("Technical Writer - Part-time or Full-time", "", "Full-time or Part-time");
textCheck("Full-time Contract Management Specialist", "", "Full-time");
textCheck("Technical Writer", "What is your employment type: Full time?", "Not stated");
textCheck("Technical Writer", "Employment Type: Full time?", "Not stated");
check("greenhouse", { metadata: [{ name: "Employment Type", value: ["Contract", "Freelance"] }] }, "Contract; Freelance");
console.log("PASS: separated hours/terms, title alternatives, occupational language, applicant questions, array metadata.");
const coreDedupe = require("../core/deduplication/job-dedupe");
assert.equal(coreDedupe.groupJobsByDedupeKey(variants).size, 3);
const coreConflict = [...coreDedupe.groupJobsByDedupeKey(conflictRows).values()].map(coreDedupe.selectCanonicalJob);
assert.equal(coreConflict.length, 1); assert.equal(displayEmploymentType(coreConflict[0]), "Needs review");
const { employmentCoverage } = require("../lib/employment-type-report");
assert.equal(employmentCoverage([textCheck("Writer", "Employment Type: Part-time", "Needs review", { employmentType: "FullTime" }, "ashby")]).statedSchedule, 1);
const { validatePublicEmploymentLabel } = require("../lib/employment-type");
for (const label of ["Full-time", "Part-time; Contract", "Full-time or Part-time; Internship", "Needs review", "Not stated"]) assert.equal(validatePublicEmploymentLabel(label), true);
for (const label of ["", "OTHER", "Contract; Part-time", "Contract; Contract", "Permanent; Contract"]) assert.equal(validatePublicEmploymentLabel(label), false);
console.log("PASS: core compatibility dedupe, conflict population, public label validation.");
const exactTitle = "Technical Writer — Contract";
assert.equal(textCheck(exactTitle, "", "Contract").EmploymentTypeEvidence[0].RawValue, exactTitle);
textCheck("Technical Writer", "Employment Type: Full‑time", "Full-time");
assert.ok(validateEmploymentType({ EmploymentSchedule: "Full-time", EmploymentTerms: [], EmploymentTypeStatus: "stated", EmploymentTypeEvidence: [] }).length);
textCheck("Technical Writer", "$40 per hour. Remote in the US.", "Not stated");
console.log("PASS: original title punctuation, nonbreaking hyphen, evidence consistency, no pay/location inference.");

for (const label of ["Temporary", "Freelance", "Internship", "Permanent", "Regular", "Fixed-term", "Apprenticeship", "Seasonal"]) check("ashby", { employmentType: label }, label);
assert.equal(sampleRows[11].EmploymentTypeEvidence.find(e => e.SourceField === "timeType").ObservedAt, load("workday-search-requests.json")[2].checkedAt);
assert.equal(sampleRows[11].EmploymentTypeEvidence.find(e => e.SourceField === "timeType").SourceURL, load("workday-search-requests.json")[2].url);
console.log("PASS: all controlled terms, search-response observation date, and source URL.");

textCheck("Writer", "Employment Type: Full-time or Part-time", "Full-time or Part-time", { employmentType: "FullTime" }, "ashby");
console.log("PASS: an explicit schedule alternative remains valid with a compatible structured value.");

// Observed normalized batch excerpt from the one approved 2026-10-24 refresh.
// It is not an original raw ATS response.
const variableObserved = load("variable-compensation-normalized-20261024.json").record;
const variableCorrected = require("../lib/employment-type").ensureEmploymentType(variableObserved);
assert.equal(displayEmploymentType(variableCorrected), "Full-time");
const rejectedVariable = variableCorrected.EmploymentTypeEvidence.find(e => e.RejectedValue === "Variable");
const oldVariable = variableObserved.EmploymentTypeEvidence.find(e => e.Value === "Variable");
assert.ok(rejectedVariable);
for (const key of ["RawValue", "SourceField", "SourceKind", "SourceURL", "ObservedAt"]) assert.equal(rejectedVariable[key], oldVariable[key]);
assert.deepEqual(require("../lib/employment-type").ensureEmploymentType(variableCorrected), variableCorrected);
assert.deepEqual(validateEmploymentType(variableCorrected), []);
textCheck("Variable Compensation Manager", "", "Not stated");
textCheck("Technical Writer", "This is a variable compensation management position.", "Not stated");
textCheck("Technical Writer (Variable Hours)", "", "Variable");
textCheck("Technical Writer", "Schedule: Variable", "Variable");
check("ashby", { employmentType: "Variable Time" }, "Variable");
console.log("PASS: observed Variable Compensation defect, explicit variable schedules, retained rejected evidence, and idempotent correction.");

// Variable hours and shift patterns do not contradict a stated hours category.
textCheck("Technical Writer (Variable Hour)", "", "Variable");
textCheck("Technical Writer (Variable Shifts)", "", "Variable");
textCheck("Technical Writer - Full-time, Variable Shift", "", "Full-time");
textCheck("Technical Writer - Part-time, Variable Hours", "", "Part-time");
textCheck("Technical Writer", "Schedule: Full-time or Part-time; Variable", "Full-time or Part-time");
const variableHoursObserved = load("variable-hours-normalized-20261024.json").record;
const variableHoursCorrected = require("../lib/employment-type").ensureEmploymentType(variableHoursObserved);
assert.equal(displayEmploymentType(variableHoursCorrected), "Part-time");
assert.ok(variableHoursCorrected.EmploymentTypeEvidence.some(e => e.Value === "Variable"));
assert.ok(!variableHoursCorrected.EmploymentTypeEvidence.some(e => e.RejectedValue));
assert.deepEqual(validateEmploymentType(variableHoursCorrected), []);
const variableHoursExport = buildJobExportArtifacts([variableHoursObserved], [], [], "2026-10-24T15:20:00Z").publicFeedRows[0];
assert.equal(displayEmploymentType(variableHoursExport), "Part-time");
assert.deepEqual(variableHoursExport.EmploymentTypeEvidence, variableHoursObserved.EmploymentTypeEvidence);
console.log("PASS: singular/plural variable hours and shifts, compatible hours categories, and export of older normalized records without changing source evidence.");
