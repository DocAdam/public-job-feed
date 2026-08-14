/**
 * Verify architecture integrity
 *
 * Checks that all core modules are properly connected and exports are correct.
 */

const path = require('path');

console.log('\n🔍 Verifying public-job-feed architecture...\n');

let errors = [];
let warnings = [];
let successes = [];

// Test 1: Verify core module loading
function testCoreModules() {
  console.log('Testing core module imports...');

  const coreModules = [
    './src/core/classification/title-match',
    './src/core/classification/title-review',
    './src/core/classification/work-arrangement',
    './src/core/deduplication/salary-detect',
    './src/core/deduplication/job-dedupe',
    './src/core/deduplication/ats-anomaly',
    './src/core/models/job-record',
    './src/core/models/job-titles',
    './src/core/pipeline/engine',
  ];

  for (const modulePath of coreModules) {
    try {
      require(path.resolve(__dirname, `../${modulePath}`));
      successes.push(`✅ ${modulePath} loaded successfully`);
    } catch (error) {
      errors.push(`❌ Failed to load ${modulePath}: ${error.message}`);
    }
  }
}

// Test 1b: Keep core modules free of direct infrastructure dependencies.
function testCorePurity() {
  console.log('\nTesting core dependency boundaries...');

  const fs = require('fs');
  const coreDir = path.resolve(__dirname, '../src/core');
  const forbiddenDependencies = /require\((['\"])(?:fs|fs\/promises|node:fs|node:fs\/promises|path|node:path|http|https)\1\)/;
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(entryPath);
    }
  }

  visit(coreDir);
  const violations = files.filter((filePath) => forbiddenDependencies.test(fs.readFileSync(filePath, 'utf8')));

  if (violations.length === 0) {
    successes.push('✅ Core modules have no direct filesystem, path, or network dependencies');
  } else {
    errors.push('❌ Core dependency boundary violations: ' + violations.join(', '));
  }
}

// Test 2: Verify adapter loading
function testAdapterModules() {
  console.log('\nTesting adapter module imports...');

  const adapterModules = [
    './src/adapters/exports/csv-builder',
    './src/adapters/exports/export-dedupe',
    './src/adapters/storage/export-run-store',
    './src/adapters/ingestion',
  ];

  for (const modulePath of adapterModules) {
    try {
      require(path.resolve(__dirname, `../${modulePath}`));
      successes.push(`✅ ${modulePath} loaded successfully`);
    } catch (error) {
      errors.push(`❌ Failed to load ${modulePath}: ${error.message}`);
    }
  }
}

// Test 3: Verify config files exist
function testConfigFiles() {
  console.log('\nTesting configuration files...');

  const fs = require('fs');
  const configFiles = [
    'config/title-watchlist.md',
    'config/settings.json',
  ];

  for (const configFile of configFiles) {
    const fullPath = path.resolve(__dirname, `../${configFile}`);
    if (fs.existsSync(fullPath)) {
      successes.push(`✅ ${configFile} exists`);
    } else {
      warnings.push(`⚠️ ${configFile} not found`);
    }
  }
}

// Test 4: Verify pipeline connections
function testPipelineConnections() {
  console.log('\nTesting pipeline connectivity...');

  try {
    const { processCatalog, buildJobFeed } = require('../src/index.js');

    if (typeof processCatalog === 'function' && typeof buildJobFeed === 'function') {
      successes.push('✅ Pipeline entry points exposed in main module');
    } else {
      errors.push('❌ Pipeline entry points not properly exposed');
    }
  } catch (error) {
    errors.push(`❌ Failed to verify pipeline: ${error.message}`);
  }
}

// Run all tests
function runAllTests() {
  testCoreModules();
  testCorePurity();
  testAdapterModules();
  testConfigFiles();
  testPipelineConnections();

  // Print results
  console.log('\n📊 Architecture Verification Results:');
  console.log('='.repeat(50));

  if (successes.length > 0) {
    console.log(`\n✅ ${successes.length} successful checks:`);
    successes.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️ ${warnings.length} warnings:`);
    warnings.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} errors:`);
    errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  }

  const total = successes.length + warnings.length + errors.length;
  const status = errors.length === 0 ? 'PASS' : 'FAIL';

  console.log('\n' + '='.repeat(50));
  console.log(`Overall Status: ${status} (${total} checks)`);
  console.log('='.repeat(50) + '\n');

  return errors.length === 0;
}

// Execute verification
const success = runAllTests();
process.exit(success ? 0 : 1);
