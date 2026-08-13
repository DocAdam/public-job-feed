const assert = require("assert");
const { categorizeTitle } = require("../lib/title-category");

function main() {
  const fixtures = [
    ["Technical Author", "Technical Writing"],
    ["Technical Documentation Illustrator, S1000D", "Technical Writing"],
    ["Director, Technical Publications", "Management / Leadership"],
    ["Content Developer", "Content Writing"],
    ["Technical Training Content Developer", "Technical Content"],
    ["Senior Director, Developer Advocacy", "Developer Relations"],
    ["Knowledge Content and Operations Engineer", "Knowledge Management"],
    ["Senior Technical Consultant - C# Developer", "Adjacent Roles"],
    ["Legal Document Specialist", "Adjacent Roles"],
    ["Director, Data & Information Architecture", "Adjacent Roles"],
  ];
  for (const [title, expected] of fixtures) assert.equal(categorizeTitle(title), expected, title);
  console.log("Title-category fixture tests passed.");
}

if (require.main === module) main();

module.exports = { main };
