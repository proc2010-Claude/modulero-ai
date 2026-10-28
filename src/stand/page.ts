// Страница прототипа сеанса (TASK_FIRST.md п. 3): превью версии, план, стены, состав, цена «полная / неполная»,
// история версий и лента диалога. Одна самодостаточная HTML-страница без внешних файлов. Рисует то, что
// вернуло ядро (previewSvg, kitchenPlan, kitchenWallElevation); ничего не пересчитывает.
import { MAIN_MODEL, PRICING, type ModelId, type SessionCost } from './cost.ts';
import type { Stand } from './stand.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rub = (v: number | null | undefined) => (typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽' : '—');
const mm = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('ru-RU') : '—');

const KIND_RU: Record<string, string> = { base: 'нижний', niche: 'ниша', upper: 'навесной', tall: 'пенал', mezz: 'антресоль', island: 'остров' };

export function renderPage(stand: Stand, cost: SessionCost): string {
  const view = stand.currentView();
  const head = stand.data.history.find((v) => v.n === stand.data.head);
  const body = view && head ? project(stand, view, head) : '<section class="card"><p class="muted">Проекта ещё нет: помощник создаст его первым вызовом start_project.</p></section>';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Прототип кухни</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div>
    <h1>Прототип · ${esc(stand.data.kind === 'kitchen' ? 'кухня' : 'изделие')}</h1>
    <p class="muted">Сеанс ${esc(stand.name)}${head ? ` · версия ${head.n} · ${esc(head.revision)}` : ''} · движок Modulero ${esc(stand.data.engine.sha.slice(0, 8))}, каталог ${esc(stand.data.engine.hardwareCatalog)}</p>
  </div>
</header>
<main class="grid">
  <div class="col">${body}</div>
  <aside class="col">${feed(stand)}${costCard(cost)}${history(stand)}</aside>
</main>
<footer class="muted">Стенд без Claude API и без публикации: размеры, состав, отказы и цена — ответы ядра Modulero. Цена — ориентир, не предложение.</footer>
</body>
</html>
`;
}

function project(stand: Stand, view: NonNullable<ReturnType<Stand['currentView']>>, head: { label: string }): string {
  const s = view.state as any,
    p = view.price as any;
  const full = p.amount_rub !== null && p.amount_rub !== undefined;
  const price = `<section class="card price ${full ? 'ok' : 'partial'}">
    <div class="badge">${full ? 'Цена полная' : 'Цена неполная'}</div>
    <div class="sum">${full ? `Ориентир ${rub(p.amount_rub)}` : `Известная часть ${rub(p.known_amount_rub)}`}</div>
    ${p.appliances_included ? '<p class="muted">Техника включена в итог.</p>' : '<p class="muted">Техника в итог не входит.</p>'}
    ${p.missing?.length ? `<details open><summary>Чего не хватает (${p.missing.length})</summary><ul>${p.missing.map((m: string) => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
  const facts = `<section class="card">
    <h2>${esc(head.label)}</h2>
    <dl class="facts">
      <dt>Помещение</dt><dd>${mm(s.room.width)} × ${mm(s.room.depth)} × ${mm(s.room.height)} мм${s.room_confirmed ? '' : ' <span class="warn">не подтверждено</span>'}</dd>
      <dt>Форма</dt><dd>${esc(TYPE_RU[s.type] ?? 'не выбрана')}${s.island ? ', с островом' : ''}</dd>
      <dt>Стены</dt><dd>${s.walls.map((w: any) => `${esc(w.title)} ${mm(w.lengthMm)} мм`).join(' · ') || '—'}</dd>
      <dt>Корпус</dt><dd>${esc(s.materials.corpus)}</dd>
      <dt>Фасады</dt><dd>${esc(s.materials.facade)}${s.materials.facade_material ? ` · ${esc(s.materials.facade_material)}` : ''}</dd>
      <dt>Детали</dt><dd>${mm(s.parts)}</dd>
    </dl>
    ${view.warnings.length ? `<ul class="warnings">${view.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  </section>`;
  const preview = `<section class="card"><h2>Вид</h2>${view.previewSvg ? `<div class="preview">${view.previewSvg}</div>` : '<p class="muted">Модулей пока нет.</p>'}</section>`;
  const walls = `<section class="card"><h2>План сверху</h2>${planSvg(view.plan, s)}</section>
    ${view.elevations.filter((e: any) => e.items.length).map((e: any) => `<section class="card"><h2>${esc(cap(e.title))}, ${mm(e.wall.lengthMm)} мм</h2>${elevationSvg(e)}</section>`).join('')}`;
  const titles = new Map<string, string>(s.walls.map((w: any) => [w.id, w.title]));
  const table = `<section class="card"><h2>Состав (${s.modules.length})</h2>${
    s.modules.length
      ? `<table><thead><tr><th>№</th><th>Модуль</th><th>Где</th><th>Ш × Г × В, мм</th></tr></thead><tbody>${s.modules
          .map(
            (m: any) =>
              `<tr><td>${esc(m.id)}</td><td>${esc(m.name)}<div class="muted">${esc(KIND_RU[m.kind] ?? m.kind)}</div></td><td>${m.wall ? `${esc(titles.get(m.wall) ?? m.wall)}${m.pos !== undefined ? `, от ${mm(m.pos)}` : ''}` : 'свободно (остров)'}</td><td>${mm(m.width)} × ${mm(m.depth)} × ${mm(m.height)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="muted">Пусто.</p>'
  }</section>`;
  return price + facts + preview + walls + table + variants(stand);
}

const TYPE_RU: Record<string, string> = { straight: 'вдоль одной стены', l: 'угловая (Г)', u: 'П-образная' };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const FILL: Record<string, string> = { base: 'var(--m-base)', niche: 'var(--m-niche)', upper: 'var(--m-upper)', tall: 'var(--m-tall)', mezz: 'var(--m-mezz)', island: 'var(--m-island)' };

function planSvg(plan: any, s: any): string {
  const { width: W, depth: D } = plan.room,
    pad = 120;
  const rects = plan.modules
    .flatMap((m: any) => [
      ...m.zone.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="zone"/>`),
      ...m.body.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${FILL[m.kind] ?? 'var(--m-base)'}" class="body"><title>${esc(m.id)} · ${esc(m.name)}</title></rect>`),
      ...(m.body[0] ? [`<text x="${m.body[0].x + m.body[0].w / 2}" y="${m.body[0].y + m.body[0].h / 2}" class="lbl">${esc(m.id)}</text>`] : []),
    ])
    .join('');
  const walls = plan.walls
    .map((w: any) => {
      const [x1, y1, x2, y2] = w.line,
        t = s.walls.find((x: any) => x.id === w.id)?.title ?? w.id,
        tx = (x1 + x2) / 2 + (x1 === x2 ? (x1 === 0 ? -70 : 70) : 0),
        ty = (y1 + y2) / 2 + (y1 === y2 ? -60 : 0);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="wall"/><text x="${tx}" y="${ty}" class="wlbl"${x1 === x2 ? ` transform="rotate(-90 ${tx} ${ty})"` : ''}>${esc(t)} · ${mm(w.lengthMm)}</text>`;
    })
    .join('');
  return `<svg class="plan" viewBox="${-pad} ${-pad} ${W + 2 * pad} ${D + 2 * pad}" role="img" aria-label="План кухни сверху"><rect x="0" y="0" width="${W}" height="${D}" class="room"/>${rects}${walls}</svg>`;
}

function elevationSvg(e: any): string {
  const L = e.wall.lengthMm,
    H = e.wall.heightMm,
    pad = 80;
  const items = e.items
    .map((it: any) => {
      const y = H - it.floor - it.height;
      if (it.role === 'zone') return `<rect x="${it.x}" y="${y}" width="${it.width}" height="${it.height}" class="zone"/>`;
      const cls = it.role === 'side' ? 'side' : 'body';
      return `<rect x="${it.x}" y="${y}" width="${it.width}" height="${it.height}" fill="${FILL[it.kind] ?? 'var(--m-base)'}" class="${cls}"><title>${esc(it.id)} · ${esc(it.name)} · ${mm(it.width)} мм</title></rect>${
        it.role === 'body' ? `<text x="${it.x + it.width / 2}" y="${y + it.height / 2}" class="lbl">${esc(it.id)}</text>` : ''
      }`;
    })
    .join('');
  const marks = (e.obstacles ?? []).map((o: any) => `<rect x="${o.pos}" y="${o.heights ? H - o.heights[1] : 0}" width="${o.width}" height="${o.heights ? o.heights[1] - o.heights[0] : H}" class="mark"><title>${esc(o.type)}</title></rect>`).join('');
  return `<svg class="elev" viewBox="${-pad} ${-pad} ${L + 2 * pad} ${H + 2 * pad}" role="img" aria-label="Вид стены"><rect x="0" y="0" width="${L}" height="${H}" class="room"/>${marks}${items}<line x1="0" y1="${H}" x2="${L}" y2="${H}" class="wall"/></svg>`;
}

function variants(stand: Stand): string {
  if (!stand.data.draft) return '';
  const d = JSON.parse(stand.data.draft);
  return `<section class="card"><h2>Варианты</h2><ul class="plain">${d.variants.map((v: any) => `<li>${v.id === d.active ? '● ' : '○ '}${esc(v.name)}</li>`).join('')}</ul></section>`;
}

const usd = (v: number) => '$' + v.toFixed(3);
const tk = (v: number) => v.toLocaleString('ru-RU');
const MODEL_RU: Record<ModelId, string> = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };

/** Расход Claude API, если бы этот диалог шёл через API (AI-DEC-006): оценка, не счёт. */
function costCard(c: SessionCost): string {
  if (!c.turns.length) return '';
  const T = c.total;
  return `<section class="card"><h2>Расход через Claude API (оценка)</h2>
    <div class="sum2">${usd(T.usd[MAIN_MODEL])} <span class="muted">за ${c.turns.length} ход., ${MODEL_RU[MAIN_MODEL]}</span></div>
    <p class="muted">Sonnet 5.5 — ${usd(T.usd['claude-sonnet-5-5'])}, Haiku 5.5 — ${usd(T.usd['claude-haiku-5-5'])}. Токены: кэш запись ${tk(T.cache_write)}, чтение ${tk(T.cache_read)}, выход ${tk(T.output)}; запросов ${T.requests}.</p>
    <table><thead><tr><th>Ход</th><th>Запр.</th><th>Вход, ток.</th><th>Выход</th><th>${MODEL_RU[MAIN_MODEL]}</th></tr></thead><tbody>${c.turns
      .map((t) => `<tr><td title="${esc(t.human)}">${t.turn}</td><td>${t.requests}</td><td>${tk(t.input + t.cache_write + t.cache_read)}</td><td>${tk(t.output)}</td><td>${usd(t.usd[MAIN_MODEL])}</td></tr>`)
      .join('')}</tbody></table>
    <p class="muted">Без запросов к API: токены по длине текста (${c.assumptions.asciiCharsPerToken} знака латиницы или ${c.assumptions.otherCharsPerToken} кириллицы на токен), рассуждения — ${c.assumptions.thinkingTokensPerResponse} ток. на ответ, кэш 5 мин; постоянная часть запроса (инструменты и правила помощника) ≈ ${tk(c.fixed_tokens)} ток. Цены — страница цен Anthropic на ${PRICING.date}. Точность ±30–50 %, уточняется замером после подключения API.</p>
  </section>`;
}

function history(stand: Stand): string {
  const rows = [...stand.historyList()].reverse();
  return `<section class="card"><h2>История версий</h2><ol class="hist" reversed>${rows
    .map(
      (v) =>
        `<li class="${v.current ? 'cur' : ''}"><b>${v.n}. ${esc(v.label)}</b><div class="muted">${esc(v.revision)} · ${
          v.price.amount_rub !== null ? `ориентир ${rub(v.price.amount_rub)}` : `известно ${rub(v.price.known_amount_rub)}, неполная`
        }</div></li>`,
    )
    .join('')}</ol></section>`;
}

function feed(stand: Stand): string {
  const lines = stand.dialog();
  // Кнопки показываются под ответом помощника, даже если offer_choices вызван до текста ответа.
  for (let i = 0; i + 1 < lines.length; i++)
    if (lines[i]!.who === 'choices' && lines[i + 1]!.who === 'ai') [lines[i], lines[i + 1]] = [lines[i + 1]!, lines[i]!];
  if (!lines.length) return '<section class="card"><h2>Диалог</h2><p class="muted">Реплик пока нет.</p></section>';
  return `<section class="card"><h2>Диалог</h2><div class="feed">${lines
    .map((l) =>
      l.who === 'choices'
        ? `<div class="chips">${(l.options ?? []).map((o) => `<span class="chip">${esc(o)}</span>`).join('')}</div>`
        : `<div class="msg ${l.who}"><div class="who">${l.who === 'human' ? 'Человек' : 'Помощник'}</div>${esc(l.text).replace(/\n/g, '<br>')}</div>`,
    )
    .join('')}</div></section>`;
}

const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--ink:#1b1f2a;--muted:#6b6f7a;--line:#d9d7d0;--accent:#3b5bdb;--ok:#2f7d4f;--okbg:#e6f4ec;--part:#9a5b00;--partbg:#fff3df;
--m-base:#e9dcc4;--m-niche:#f1ece2;--m-upper:#dbe6f3;--m-tall:#d9d2ee;--m-mezz:#e4e0f2;--m-island:#d8eadf;--zone:#0000;--human:#eef1fb;--ai:#f3f2ee}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171c;--card:#1e2128;--ink:#e8e8ea;--muted:#9a9ea8;--line:#343843;--accent:#8ea6ff;--ok:#7fd3a0;--okbg:#1d3328;--part:#f0b75a;--partbg:#3a2c14;
--m-base:#5a4b33;--m-niche:#3c3a34;--m-upper:#2f4258;--m-tall:#463d63;--m-mezz:#3d3954;--m-island:#2f4a3a;--human:#252b3d;--ai:#262830}}
:root[data-theme="dark"]{--bg:#15171c;--card:#1e2128;--ink:#e8e8ea;--muted:#9a9ea8;--line:#343843;--accent:#8ea6ff;--ok:#7fd3a0;--okbg:#1d3328;--part:#f0b75a;--partbg:#3a2c14;
--m-base:#5a4b33;--m-niche:#3c3a34;--m-upper:#2f4258;--m-tall:#463d63;--m-mezz:#3d3954;--m-island:#2f4a3a;--human:#252b3d;--ai:#262830}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.top{padding:16px 16px 0;max-width:1240px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 10px}
.muted{color:var(--muted);font-size:13px}
.grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;padding:16px;max-width:1240px;margin:0 auto}
@media (max-width:860px){.grid{grid-template-columns:minmax(0,1fr)}}
.col{display:flex;flex-direction:column;gap:16px;min-width:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}
.price .badge{display:inline-block;font-weight:600;font-size:13px;padding:2px 10px;border-radius:99px}
.price.ok .badge{background:var(--okbg);color:var(--ok)}.price.partial .badge{background:var(--partbg);color:var(--part)}
.price .sum{font-size:24px;font-weight:650;margin:6px 0 2px}.sum2{font-size:20px;font-weight:650;margin:0 0 4px}
.price ul{margin:6px 0 0;padding-left:18px;font-size:13px}
.facts{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0}.facts dt{color:var(--muted)}.facts dd{margin:0}
.warn{color:var(--part)}.warnings{color:var(--part);margin:10px 0 0;padding-left:18px}
.preview svg{width:100%;height:auto;max-height:420px;display:block;background:#fff;border-radius:8px}
svg.plan,svg.elev{width:100%;height:auto;display:block}
svg .room{fill:none;stroke:var(--line);stroke-width:8;stroke-dasharray:30 20}
svg .wall{stroke:var(--ink);stroke-width:24}
svg .body{stroke:var(--ink);stroke-width:6}svg .side{stroke:var(--ink);stroke-width:4;opacity:.45}
svg .zone{fill:var(--muted);opacity:.18;stroke:var(--muted);stroke-width:3}
svg .mark{fill:var(--accent);opacity:.18}
svg .lbl{fill:var(--ink);font-size:90px;text-anchor:middle;dominant-baseline:middle}
svg .wlbl{fill:var(--muted);font-size:80px;text-anchor:middle;dominant-baseline:middle}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 6px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500;border-top:0}
.plain{list-style:none;padding:0;margin:0}
.hist{margin:0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:8px}.hist li{padding:6px 8px;border-radius:8px}.hist li.cur{background:var(--okbg)}
.feed{display:flex;flex-direction:column;gap:8px;max-height:70vh;overflow:auto}
.msg{padding:8px 10px;border-radius:10px;font-size:14px}.msg.human{background:var(--human);align-self:flex-end;max-width:92%}.msg.ai{background:var(--ai);max-width:96%}
.who{font-size:12px;color:var(--muted);margin-bottom:2px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--accent);color:var(--accent);border-radius:99px;padding:2px 10px;font-size:13px}
footer{max-width:1240px;margin:0 auto;padding:0 16px 24px}
`;
