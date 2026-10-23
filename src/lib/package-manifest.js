const { rowsToCsv } = require('./csv');

const manifestHeaders = Object.freeze([
  'FileName', 'SourcePath', 'OutputPath', 'Exists', 'SizeBytes',
  'RecommendedSheetTabName', 'RecommendedPrimary', 'RecommendedSecondary',
  'RecommendedUse', 'Purpose', 'Notes',
]);

function manifestCsv(rows, previousHeaders = []) {
  // A generated first row can omit fields used by later copied-file rows.
  const headers = [...new Set([...manifestHeaders, ...previousHeaders, ...rows.flatMap(Object.keys)])];
  return rowsToCsv(headers, rows);
}

module.exports = { manifestHeaders, manifestCsv };
