const path = require('node:path');
const crypto = require('node:crypto');

// Opt in only for new bundles. Older manifests retain their exact-file rule.
const POLICY = 'appledouble-provenance-v1';
// The observed 4096-byte AppleDouble encoding has one 11-byte provenance value.
// All other bytes, including Finder info, attribute table, blank resource fork,
// padding and resource map, must match this profile. No other attributes qualify.
const PROFILE_HASH = 'efc62f9e2737a641e8b5a2af7d7c1315bb577b8a8b06cd1359fb52a285e5239c';
function provenanceOnly(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== 4096) return false;
  const profile = Buffer.from(bytes);
  profile.fill(0, 152, 163);
  return crypto.createHash('sha256').update(profile).digest('hex') === PROFILE_HASH;
}
function counterpart(name, expected) {
  const base = path.posix.basename(name);
  if (!base.startsWith('._')) return null;
  const target = path.posix.join(path.posix.dirname(name), base.slice(2));
  return expected.has(target) ? target : null;
}
module.exports = { POLICY, PROFILE_HASH, provenanceOnly, counterpart };
