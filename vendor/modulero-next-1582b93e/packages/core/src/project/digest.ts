// Content digest compatible with the prototype's mwDigest (js/12_mw_workspace_core.js),
// so that files saved by the prototype can be verified. Not a cryptographic hash.

/** Canonical text: object keys sorted, arrays in order, primitives via JSON.stringify. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return String(JSON.stringify(value));
}

/** Two 32-bit FNV-style lanes over the canonical text: "MWD-" + 16 hex digits. */
export function contentDigest(value: unknown): string {
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  const source = canonicalJson(value);
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code + (a >>> 11), 0x85ebca6b) >>> 0;
  }
  return `MWD-${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}
