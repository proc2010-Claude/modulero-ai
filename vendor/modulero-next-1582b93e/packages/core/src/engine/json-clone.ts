// A copy of JSON data equal to JSON.parse(JSON.stringify(x)), without the text in between (MOD-DEC-244, FINDINGS 919).
// The kitchen copies its records at every layer, as the prototype did; the text of each copy was a tenth of an edit.
// The rules are those of JSON.stringify: toJSON first, boxed primitives unboxed, a number that is not finite is null
// and −0 is 0, a key of undefined, a function or a symbol is left out, in an array they are null; a BigInt throws.

function value(v: unknown, key: string | number): unknown {
  if (v !== null && typeof v === 'object') {
    if (typeof (v as { toJSON?: unknown }).toJSON === 'function') v = (v as { toJSON: (k: string) => unknown }).toJSON(String(key));
    else if (v instanceof Number) v = Number(v);
    else if (v instanceof String) v = String(v);
    else if (v instanceof Boolean) v = v.valueOf();
  }
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return v;
    case 'number':
      return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
    case 'bigint':
      throw new TypeError('Do not know how to serialize a BigInt');
    case 'object': {
      if (v === null) return null;
      if (Array.isArray(v)) {
        const n = v.length,
          a = new Array(n);
        for (let i = 0; i < n; i++) {
          const r = value(v[i], i);
          a[i] = r === undefined ? null : r;
        }
        return a;
      }
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v)) {
        const r = value((v as Record<string, unknown>)[k], k);
        if (r === undefined) continue;
        // JSON.parse makes «__proto__» an own key; an assignment would set the prototype.
        if (k === '__proto__') Object.defineProperty(o, k, { value: r, writable: true, enumerable: true, configurable: true });
        else o[k] = r;
      }
      return o;
    }
    default:
      return undefined;
  }
}

/** JSON.parse(JSON.stringify(x)) without the text: the same value, a SyntaxError where JSON.parse would throw one. */
export function jsonClone<T>(x: T): T {
  const r = value(x, '');
  if (r === undefined) throw new SyntaxError('"undefined" is not valid JSON');
  return r as T;
}
