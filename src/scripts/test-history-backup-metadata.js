const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const F = require('../lib/history-backup-files');
const M = require('../lib/history-backup-metadata');
const B = require('../lib/daily-history-backup');
const fixture = require('./fixtures/history-backup/observed-appledouble-provenance.json');
const observed = Buffer.from(fixture.base64, 'base64');

async function testMetadata({ temp, bundle, options, drive }) {
  assert.equal(F.digest('profile test').length, 64);
  assert.equal(M.provenanceOnly(observed), true);
  // Only the opaque 11-byte provenance value may vary in this exact encoding.
  for (let i = 0; i < observed.length; i++) {
    const changed = Buffer.from(observed); changed[i] ^= 1;
    assert.equal(M.provenanceOnly(changed), i >= 152 && i < 163, 'profile byte ' + i);
  }
  assert.equal(M.provenanceOnly(observed.subarray(0, 4095)), false);
  const root = path.join(temp, 'metadata-cases'); await fs.mkdir(root);
  async function copy(name, policy = M.POLICY) {
    const folder = path.join(root, name); await fs.cp(bundle.folder, folder, { recursive: true });
    const m = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
    if (policy === null) delete m.metadataPolicy; else m.metadataPolicy = policy;
    await editManifest(folder, m); return folder;
  }
  async function editManifest(folder, m) {
    await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify(m));
    const p = JSON.parse(await fs.readFile(path.join(folder, 'VERIFIED.json'), 'utf8'));
    p.manifestHash = F.digest(m); await fs.writeFile(path.join(folder, 'VERIFIED.json'), JSON.stringify(p));
  }
  const normal = await copy('normal'); assert.equal((await F.verifyBundle(normal)).metadataFiles.length, 0);
  const old = await copy('old-format', null); await F.verifyBundle(old);
  await fs.writeFile(path.join(old, '._manifest.json'), observed);
  await assert.rejects(F.verifyBundle(old), /Unexpected backup files/, 'old manifests do not opt in');
  const valid = await copy('observed');
  for (const name of ['._manifest.json', '._VERIFIED.json', '._payload', 'payload/._000000.gz']) await fs.writeFile(path.join(valid, name), observed);
  const checked = await F.verifyBundle(valid); assert.equal(checked.metadataFiles.length, 4);
  const restored = path.join(root, 'restored'); await fs.mkdir(restored); await F.restore(valid, restored, checked);
  assert.equal(await fs.access(path.join(restored, 'history/jobs-history.duckdb')).then(() => true), true);
  assert.equal((await fs.readdir(restored)).includes('._manifest.json'), false, 'metadata is not restored as payload');
  const missing = await copy('missing');
  await fs.unlink(path.join(missing, bundle.files[0].stored));
  await fs.writeFile(path.join(missing, 'payload/._000000.gz'), observed);
  await assert.rejects(F.verifyBundle(missing), /Missing backup files/);
  const changed = await copy('changed'); await fs.appendFile(path.join(changed, bundle.files[0].stored), 'changed');
  await assert.rejects(F.verifyBundle(changed), /checksum/);
  for (const [name, contents] of [['unrelated', observed], ['._manifest.json', Buffer.from('not AppleDouble')], ['._unknown', observed]]) {
    const folder = await copy('unexpected-' + path.basename(name)); await fs.writeFile(path.join(folder, name), contents);
    await assert.rejects(F.verifyBundle(folder), /Unexpected backup files/);
  }
  const malformed = await copy('extra-attribute'); const bytes = Buffer.from(observed); bytes[119] = 2;
  await fs.writeFile(path.join(malformed, '._manifest.json'), bytes);
  await assert.rejects(F.verifyBundle(malformed), /Unexpected backup files/);
  const alias = await copy('symlink'); await fs.symlink(path.join(alias, 'manifest.json'), path.join(alias, '._manifest.json'));
  await assert.rejects(F.verifyBundle(alias), /Symlink/);
  const unsafe = await copy('unsafe'); const m = JSON.parse(await fs.readFile(path.join(unsafe, 'manifest.json'), 'utf8'));
  m.files[0].path = '../escape'; await editManifest(unsafe, m);
  await assert.rejects(F.verifyBundle(unsafe), /Invalid backup member/);
  await assert.rejects(F.restore(unsafe, restored, m), /Unsafe restore path/);
  await assert.rejects(F.verifyBundle(await copy('unknown-policy', 'ignore-all-dot-files')), /Unknown backup metadata policy/);
  const incomplete = await copy('incomplete'); await fs.unlink(path.join(incomplete, 'VERIFIED.json'));
  await assert.rejects(F.verifyBundle(incomplete), /ENOENT/);
  console.log('PASS exact AppleDouble profile, opt-in policy, required payload, checksums, unknown files, invalid metadata, paths, symlinks and incomplete proof');

  const stateFile = path.join(root, 'state.json'); await fs.copyFile(options.stateFile, stateFile);
  const original = await fs.readFile(stateFile, 'utf8');
  async function attempt(name, at) {
    const directory = path.join(root, name);
    const result = await B.backupOnly({ ...options, stateFile }, { probeDrive: drive,
      createBackup: args => B.createBackup({ ...args, directory, at }) });
    return { result, directory };
  }
  const crash = await attempt('interrupted', async phase => { if (phase === 'copied') throw new Error('Fixture interrupted'); });
  assert.equal(crash.result.Backup, 'FAILED'); assert.equal(await fs.readFile(stateFile, 'utf8'), original);
  const pendingCrash = (await fs.readdir(crash.directory)).find(n => n.startsWith('.pending-'));
  assert.ok(pendingCrash); await assert.rejects(F.verifyBundle(path.join(crash.directory, pendingCrash)), /ENOENT/);
  const failed = await attempt('rejected', async (phase, folder) => {
    if (phase === 'verified') {
      assert.equal(await fs.readFile(stateFile, 'utf8'), original);
      await fs.writeFile(path.join(folder, '._manifest.json'), 'misleading metadata');
    }
  });
  assert.equal(failed.result.Backup, 'FAILED'); assert.match(failed.result.Warnings.join(), /Unexpected backup files/);
  assert.equal(await fs.readFile(stateFile, 'utf8'), original);
  assert.equal((await fs.readdir(failed.directory)).some(n => n.startsWith('daily-')), false);
  const successful = await attempt('accepted', async (phase, folder) => {
    if (phase === 'verified') {
      assert.equal(await fs.readFile(stateFile, 'utf8'), original);
      assert.ok(path.basename(folder).startsWith('.pending-'));
      await fs.writeFile(path.join(folder, '._manifest.json'), observed);
    }
  });
  assert.equal(successful.result.History, 'PASS'); assert.equal(successful.result.Imported, 0);
  assert.equal(successful.result.Backup, 'PASS', successful.result.Warnings.join());
  assert.ok(path.basename(successful.result.LastVerified.folder).startsWith('daily-'));
  assert.equal(successful.result.LastVerified.metadata.count, 1);
  assert.equal(JSON.parse(await fs.readFile(stateFile, 'utf8')).lastVerified.folder, successful.result.LastVerified.folder);
  const proof = await F.verifyBundle(successful.result.LastVerified.folder);
  assert.equal(proof.proof.fullRestore, true); assert.equal(proof.proof.reportMatches, true);
  assert.equal(proof.generation, successful.result.Generation);
  console.log('PASS backup-only full restore; interruption and final rejection preserve candidates and prior state; only accepted verification updates state');
}
module.exports = { testMetadata };
