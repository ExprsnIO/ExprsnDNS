/**
 * Exprsn DNS - DNS name utilities
 *
 * Normalizes/validates DNS names, handles zone-matching, and produces the
 * canonical form (lower-case, single trailing dot stripped) used in storage.
 */

const LABEL_RE = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/i;
const MAX_NAME_LEN = 253;

function normalize(name) {
  if (typeof name !== 'string') throw new TypeError('DNS name must be a string');
  let n = name.trim().toLowerCase();
  if (n.endsWith('.')) n = n.slice(0, -1);
  return n;
}

function isValid(name) {
  try {
    const n = normalize(name);
    if (n.length === 0 || n.length > MAX_NAME_LEN) return false;
    if (n === '@') return true;
    return n.split('.').every((lbl) => LABEL_RE.test(lbl));
  } catch {
    return false;
  }
}

function isSubdomainOf(name, zone) {
  const n = normalize(name);
  const z = normalize(zone);
  if (n === z) return true;
  return n.endsWith(`.${z}`);
}

function relativize(name, zone) {
  const n = normalize(name);
  const z = normalize(zone);
  if (n === z) return '@';
  if (!isSubdomainOf(n, z)) return n;
  return n.slice(0, n.length - z.length - 1);
}

function absolutize(name, zone) {
  const n = normalize(name);
  if (n === '@' || n === '') return normalize(zone);
  if (isSubdomainOf(n, zone)) return n;
  return `${n}.${normalize(zone)}`;
}

function labelCount(name) {
  const n = normalize(name);
  return n === '' ? 0 : n.split('.').length;
}

module.exports = {
  normalize,
  isValid,
  isSubdomainOf,
  relativize,
  absolutize,
  labelCount
};
