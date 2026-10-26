const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const lib=require('./project/src/lib/employment-type');const context={ats:'ashby',fetchedAt:'2026-10-24T14:31:27.355Z',fetchUrl:'https://example.test/board'};
function check(title,description,raw,expected){const row={Title:title,Description:description,ATS:'ashby',URL:'https://example.test/job'};const result=lib.extractEmploymentType(raw,row,context);assert.equal(lib.displayEmploymentType(result),expected,title+' / '+description);assert.deepEqual(lib.validateEmploymentType(result),[]);return result;}
check('Senior Variable Compensation Manager','',{employmentType:'FullTime'},'Full-time');
check('Technical Writer','This is a variable compensation management position.',{},'Not stated');
check('Technical Writer (Variable Hours)','',{},'Variable');
check('Technical Writer','This is a variable schedule position.',{},'Variable');
check('Technical Writer','Schedule: Variable',{},'Variable');
check('Technical Writer','',{employmentType:'Variable'},'Variable');
check('Technical Writer','',{employmentType:'Variable Time'},'Variable');
const observed=JSON.parse(fs.readFileSync(path.join(__dirname,'variable-compensation-observed-case.json'))).record;
const corrected=lib.ensureEmploymentType(observed);assert.equal(lib.displayEmploymentType(corrected),'Full-time');
const rejected=corrected.EmploymentTypeEvidence.find(e=>e.RejectedValue==='Variable');assert.ok(rejected);const original=observed.EmploymentTypeEvidence.find(e=>e.Value==='Variable');for(const key of ['RawValue','SourceField','SourceKind','SourceURL','ObservedAt'])assert.equal(rejected[key],original[key]);
assert.deepEqual(lib.ensureEmploymentType(corrected),corrected);assert.deepEqual(lib.validateEmploymentType(corrected),[]);
console.log('PASS: occupational Variable text is excluded; explicit variable schedules remain; older bad evidence is retained and rejected with its original provenance; correction is idempotent.');
