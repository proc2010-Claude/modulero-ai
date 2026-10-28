// Drawing exports of the graph (task W10, prototype file 09): the sheets as SVG files in one zip archive, and one
// printable document of all sheets. The PDF is printed from that document by the browser («Печать → Сохранить как
// PDF»), as in the prototype (u137OpenDocument, r1.html:20543): every sheet is a page of its own paper size, A3 for
// the general drawing and A4 for a part (FINDINGS 544). Both are pure functions of the sheets: same sheets, same bytes.
import type { Sheet } from './drawings.js';

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Paper of a sheet as a CSS named page: `a3` or `a4`, landscape. */
const paperOf = (s: Sheet) => (s.widthMm >= 400 ? 'a3' : 'a4');

/**
 * One HTML page with every sheet on a page of its own paper; the toolbar is not printed. Text of the sheets is
 * escaped by the sheets themselves; the page adds only the title.
 */
export function drawingDocumentHtml(sheets: Sheet[], title: string): string {
  const pages = sheets
    .map((s) => `<section class="sheet ${paperOf(s)}" data-sheet-name="${esc(s.name)}"${s.partId ? ` data-part-id="${esc(s.partId)}"` : ''}>${s.svg}</section>`)
    .join('\n');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
@page a4 { size: 297mm 210mm; margin: 0; }
@page a3 { size: 420mm 297mm; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: #e9e9e6; font: 14px Arial, sans-serif; color: #20252a; }
.toolbar { position: sticky; top: 0; z-index: 1; display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #d6d4cf; }
.toolbar button { font: inherit; padding: 6px 14px; }
.sheet { margin: 12px auto; background: #fff; break-after: page; }
.sheet:last-child { break-after: auto; }
.sheet.a4 { page: a4; width: 297mm; height: 210mm; }
.sheet.a3 { page: a3; width: 420mm; height: 297mm; }
.sheet svg { display: block; width: 100%; height: 100%; }
@media print { body { background: #fff; } .toolbar { display: none; } .sheet { margin: 0; } }
</style>
</head>
<body>
<div class="toolbar"><button type="button" onclick="print()">Печать / сохранить PDF</button><span>${esc(title)} · листов: ${sheets.length}</span></div>
${pages}
</body>
</html>
`;
}

// ---------------------------------------------------------------- zip (stored, no compression)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A zip archive of the files, stored without compression, names in UTF-8 (flag 11), the date fixed to 1980-01-01 so
 * the same files give the same bytes.
 */
export function zipFiles(files: { name: string; content: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder(),
    chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, at: number, x: number) => v.setUint16(at, x, true),
    u32 = (v: DataView, at: number, x: number) => v.setUint32(at, x >>> 0, true);
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name),
      data = typeof f.content === 'string' ? enc.encode(f.content) : f.content,
      crc = crc32(data),
      local = new Uint8Array(30 + name.length),
      lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20);
    u16(lv, 6, 0x0800);
    u16(lv, 8, 0);
    u16(lv, 10, 0);
    u16(lv, 12, DOS_DATE);
    u32(lv, 14, crc);
    u32(lv, 18, data.length);
    u32(lv, 22, data.length);
    u16(lv, 26, name.length);
    u16(lv, 28, 0);
    local.set(name, 30);
    const head = new Uint8Array(46 + name.length),
      cv = new DataView(head.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 10, 0);
    u16(cv, 12, 0);
    u16(cv, 14, DOS_DATE);
    u32(cv, 16, crc);
    u32(cv, 20, data.length);
    u32(cv, 24, data.length);
    u16(cv, 28, name.length);
    u32(cv, 42, offset);
    head.set(name, 46);
    chunks.push(local, data);
    central.push(head);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0),
    end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 8, files.length);
  u16(ev, 10, files.length);
  u32(ev, 12, size);
  u32(ev, 16, offset);
  const out = new Uint8Array(offset + size + end.length);
  let at = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The sheets as `<name>.svg` in one archive, with the printable page next to them. */
export function drawingZip(sheets: Sheet[], title: string): Uint8Array {
  return zipFiles([...sheets.map((s) => ({ name: `${s.name}.svg`, content: s.svg })), { name: 'чертежи.html', content: drawingDocumentHtml(sheets, title) }]);
}
