// Byte-level helpers that do not depend on the runtime (no Buffer, TextDecoder, atob or node:crypto),
// so the reader gives the same result in Node, in a browser and in a worker.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(data: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  let i = 0;
  for (; i + 2 < data.length; i += 3) {
    const n = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    chunk += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    if (chunk.length >= 8192) { parts.push(chunk); chunk = ''; }
  }
  const rest = data.length - i;
  if (rest === 1) {
    const n = data[i] << 16;
    chunk += B64[n >> 18] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (data[i] << 16) | (data[i + 1] << 8);
    chunk += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  parts.push(chunk);
  return parts.join('');
}

const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_INDEX[B64.charCodeAt(i)] = i;

/** Strict base64 (padding required, no whitespace). Throws RangeError on anything else. */
export function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new RangeError('base64 length is not a multiple of 4');
  let pad = 0;
  if (text.endsWith('==')) pad = 2; else if (text.endsWith('=')) pad = 1;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const c = text.charCodeAt(i + k);
      let v: number;
      if (c === 61 /* = */ && i + k >= text.length - pad) v = 0;
      else v = c < 128 ? B64_INDEX[c] : -1;
      if (v < 0) throw new RangeError('invalid base64 character at ' + (i + k));
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function toHex(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i++) s += (data[i] < 16 ? '0' : '') + data[i].toString(16);
  return s;
}

function fromCodeUnits(units: number[]): string {
  let s = '';
  for (let i = 0; i < units.length; i += 8192) s += String.fromCharCode(...units.slice(i, i + 8192));
  return s;
}

/** Strict UTF-8: overlong forms, surrogates and code points above U+10FFFF are errors. */
export function decodeUtf8Strict(data: Uint8Array): string {
  const units: number[] = [];
  let i = 0;
  const bad = (why: string): never => { throw new RangeError(`${why} at byte ${i}`); };
  while (i < data.length) {
    const b = data[i];
    if (b < 0x80) { units.push(b); i++; continue; }
    let need: number; let cp: number; let min: number;
    if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; min = 0x80; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; min = 0x800; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; min = 0x10000; }
    else return bad('invalid start byte 0x' + b.toString(16));
    for (let k = 1; k <= need; k++) {
      const c = data[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return bad('invalid continuation byte');
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp < min) return bad('overlong encoding');
    if (cp >= 0xd800 && cp <= 0xdfff) return bad('encoded surrogate');
    if (cp > 0x10ffff) return bad('code point above U+10FFFF');
    if (cp >= 0x10000) { cp -= 0x10000; units.push(0xd800 | (cp >> 10), 0xdc00 | (cp & 0x3ff)); }
    else units.push(cp);
    i += need + 1;
  }
  return fromCodeUnits(units);
}

/** Strict UTF-16LE: an unpaired surrogate is an error. Length must be even. */
export function decodeUtf16leStrict(data: Uint8Array): string {
  if (data.length % 2) throw new RangeError('odd number of bytes');
  const units: number[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const u = data[i] | (data[i + 1] << 8);
    if (u >= 0xd800 && u <= 0xdbff) {
      const next = i + 3 < data.length ? data[i + 2] | (data[i + 3] << 8) : -1;
      if (next < 0xdc00 || next > 0xdfff) throw new RangeError(`unpaired high surrogate at byte ${i}`);
      units.push(u, next);
      i += 2;
    } else if (u >= 0xdc00 && u <= 0xdfff) {
      throw new RangeError(`unpaired low surrogate at byte ${i}`);
    } else units.push(u);
  }
  return fromCodeUnits(units);
}

export function startsWith(data: Uint8Array, prefix: ArrayLike<number>, at = 0): boolean {
  if (data.length < at + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (data[at + i] !== prefix[i]) return false;
  return true;
}

export function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

/** repr() of a string as Python writes it, for messages that quote names. */
export function pyRepr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (ch === quote || ch === '\\') out += '\\' + ch;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f) out += '\\x' + c.toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + quote;
}
