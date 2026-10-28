// Страница прототипа сеанса (TASK_FIRST.md п. 3): 3D, состав, цена «полная / неполная», история версий и лента
// диалога; у кухни ещё план и стены, у шкафа — секции с наполнением. Одна самодостаточная HTML-страница без внешних файлов: 3D-вид конструктора
// (сборка apps/web/src/view3d) и образцы декоров лежат в ней. Рисует то, что
// вернуло ядро (3D-сцена sceneOf, previewSvg, kitchenPlan, kitchenWallElevation, сводки редактора шкафа); ничего не пересчитывает.
import { MAIN_MODEL, PRICING, type ModelId, type SessionCost } from './cost.ts';
import type { ProductKind, ProductView, Stand } from './stand.ts';
import { buildSync } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineDir } from '../engine/pin.mjs';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rub = (v: number | null | undefined) => (typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽' : '—');
const mm = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('ru-RU') : '—');

const PRODUCT_RU: Record<ProductKind, [string, string]> = { kitchen: ['кухня', 'кухни'], wardrobe: ['распашной шкаф', 'шкафа'], sliding: ['шкаф-купе', 'шкафа-купе'], home: ['другая мебель', 'мебели'] };

const KIND_RU: Record<string, string> = { base: 'нижний', niche: 'ниша', upper: 'навесной', tall: 'пенал', mezz: 'антресоль', island: 'остров' };

export function renderPage(stand: Stand, cost: SessionCost): string {
  const view = stand.currentView();
  const head = stand.data.history.find((v) => v.n === stand.data.head);
  const empty = '<section class="card"><p class="muted">Проекта ещё нет: помощник создаст его первым вызовом start_project.</p></section>';
  const parts = view && head ? project(stand, view, head) : { stage: empty, details: '' };
  const product = stand.data.kind ? PRODUCT_RU[stand.data.kind] : null;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Прототип ${esc(product?.[1] ?? 'изделия')}</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div>
    <h1>Прототип · ${esc(product?.[0] ?? 'изделие')}</h1>
    <p class="muted">Сеанс ${esc(stand.name)}${head ? ` · версия ${head.n} · ${esc(head.revision)}` : ''} · движок Modulero ${esc(stand.data.engine.sha.slice(0, 8))}, каталог ${esc(stand.data.engine.hardwareCatalog)}</p>
  </div>
</header>
<main class="stage">
  <div class="stage-3d">${parts.stage}</div>
</main>
<div class="details">${parts.details}${costCard(cost)}${history(stand)}</div>
<footer class="muted">Стенд без Claude API и без публикации: размеры, состав, отказы и цена — ответы ядра Modulero. Цена — ориентир, не предложение.</footer>
</body>
</html>
`;
}

function project(stand: Stand, view: NonNullable<ReturnType<Stand['currentView']>>, head: { label: string }): { stage: string; details: string } {
  const s = view.state as any,
    p = view.price as any;
  const full = p.amount_rub !== null && p.amount_rub !== undefined;
  const price = `<section class="card price ${full ? 'ok' : 'partial'}">
    <div class="badge">${full ? 'Цена полная' : 'Цена неполная'}</div>
    <div class="sum">${full ? `Ориентир ${rub(p.amount_rub)}` : `Известная часть ${rub(p.known_amount_rub)}`}</div>
    ${'appliances_included' in p ? (p.appliances_included ? '<p class="muted">Техника включена в итог.</p>' : '<p class="muted">Техника в итог не входит.</p>') : ''}
    ${p.missing?.length ? `<details open><summary>Чего не хватает (${p.missing.length})</summary><ul>${p.missing.map((m: string) => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
  const stage = stage3d(stand, view);
  if (s.kind === 'home') return { stage, details: price + homeFacts(s, head.label, view.warnings) + variants(stand) };
  if (!('plan' in view)) return { stage, details: price + wardrobeFacts(s, head.label) + wardrobeSections(s) + variants(stand) };
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
  return { stage, details: price + facts + walls + table + variants(stand) };
}

/**
 * Текущая цена изделия — в левом нижнем углу поля 3D (владелец 2026-10-28, AI-DEC-008): ориентир из ответа стенда
 * или известная часть с пометкой «цена неполная». Помощник цену в тексте ответа не пишет.
 */
function priceBadge(p: { amount_rub?: number | null; known_amount_rub?: number | null }): string {
  const full = p.amount_rub !== null && p.amount_rub !== undefined;
  const text = full ? `Ориентир ${rub(p.amount_rub)}` : typeof p.known_amount_rub === 'number' ? `Известная часть ${rub(p.known_amount_rub)} · цена неполная` : 'Цена неизвестна';
  return `<div class="v3d-price ${full ? 'ok' : 'partial'}" id="v3d-price">${esc(text)}</div>`;
}

/** 3D-вид конструктора во всё окно слева, под ним — статичное превью ядра, если нет WebGL. */
function stage3d(stand: Stand, view: ProductView): string {
  return `<section class="card"><h2>3D</h2>${
    view.scene3d.scene.parts.length
      ? `<div class="v3d"><div class="view3d" id="v3d"><p class="view3d-status" role="status">Загружаем 3D…</p></div>${priceBadge(view.price as any)}
    <div class="v3d-bar"><button type="button" data-act="fronts" aria-pressed="true">Фасады</button><button type="button" data-act="open">Открыть фасады</button><button type="button" data-act="neutral" aria-pressed="false">Без декоров</button><button type="button" data-act="xray" aria-pressed="false">Рентген</button><button type="button" data-act="explode" aria-pressed="false">Взрыв</button><button type="button" data-act="fit">Вписать</button></div></div>
    <p class="muted">3D-вид конструктора Modulero ${esc(stand.data.engine.sha.slice(0, 8))}: та же сцена, материалы и свет. Тяните — повернуть, колесо или два пальца — приблизить, правая кнопка — сдвинуть, нажатие на дверь или ящик — открыть или закрыть его, на створку купе — сдвинуть её.</p>
    <div class="v3d-fallback" hidden>${view.previewSvg ? `<div class="preview">${view.previewSvg}</div>` : ''}</div>
    <script type="application/json" id="scene3d">${json(view.scene3d)}</script><script type="application/json" id="models3d">${json(modelFiles(view.scene3d.scene))}</script><script>${view3dModule()}</script><script>${explodeModule()}</script><script>${VIEWER}</script>`
      : `<p class="muted">${'plan' in view ? 'Модулей' : 'Деталей'} пока нет.</p>`
  }</section>`;
}

const yes = (v: unknown) => (v ? 'есть' : 'нет');

/** Шкаф: габарит, основание, помещение, декор, ручки — из сводок редактора ядра (wardrobe.ts). */
function wardrobeFacts(s: any, label: string): string {
  const room = [s.room.niche ? 'в нише' : null, s.room.wall_left ? 'стена слева' : null, s.room.wall_right ? 'стена справа' : null, s.room.ceiling ? `потолок ${mm(s.room.ceiling)} мм` : null].filter(Boolean);
  const d = s.sliding;
  return `<section class="card">
    <h2>${esc(label)}</h2>
    <dl class="facts">
      <dt>Ш × В × Г</dt><dd>${mm(s.size.width)} × ${mm(s.size.height)} × ${mm(s.size.depth)} мм</dd>
      <dt>Секции</dt><dd>${s.sections.filter((x: any) => !x.mezzanine).length}${s.mezzanine_height ? `, антресоль ${mm(s.mezzanine_height)} мм` : ''}</dd>
      <dt>Корпуса</dt><dd>${s.bodies.filter((b: any) => !b.over).length}${s.body_joints.length ? `, стык после секции ${s.body_joints.join(', ')}` : ''}</dd>
      ${d ? `<dt>Двери-купе</dt><dd>${d.doors ? `створок ${d.doors}, ${esc(d.system)}${d.mirrored_tracks ? ', раскладка зеркальная' : ''}` : 'не заданы'}</dd>` : `<dt>Двери</dt><dd>${esc(s.facade_mounting)}</dd>`}
      <dt>Основание</dt><dd>${esc(s.base.kind)}${s.base.height ? ` ${mm(s.base.height)} мм` : ''}</dd>
      <dt>Крыша / задняя стенка</dt><dd>${yes(s.top)} / ${yes(s.back)}</dd>
      <dt>Помещение</dt><dd>${esc(room.join(', ') || 'отдельно стоящий')}</dd>
      <dt>Корпус</dt><dd>${esc(s.corpus)}</dd>
      <dt>Ручки</dt><dd>${esc(s.handles)}</dd>
      <dt>Подсветка</dt><dd>${esc(Array.isArray(s.lighting) ? s.lighting.join(', ') : (s.lighting ?? 'нет'))}</dd>
      <dt>Детали</dt><dd>${mm(s.parts)}</dd>
    </dl>
  </section>`;
}

/** Другая мебель: заготовка, материал, корпуса с наполнением — из проекта редактора HOME (home.ts). */
function homeFacts(s: any, label: string, warnings: string[]): string {
  const fill = (b: any) => [b.shelves.length ? `полок ${b.shelves.length}` : null, b.doors.length ? `дверец ${b.doors.length}` : null, b.drawers.length ? `ящиков ${b.drawers.length}` : null, b.partitions.length ? `перегородок ${b.partitions.length}` : null].filter(Boolean).join(', ') || 'пусто';
  return `<section class="card">
    <h2>${esc(label)}</h2>
    <dl class="facts">
      <dt>Изделие</dt><dd>${esc(s.name)}</dd>
      <dt>Материал</dt><dd>${esc(s.material)}${s.facade ? ` · фасады ${esc(s.facade)}` : ''}</dd>
      <dt>Ручка</dt><dd>${esc(s.handle ?? '—')}</dd>
      <dt>Пол</dt><dd>${esc(s.floor)}</dd>
      <dt>Детали</dt><dd>${mm(s.parts)}</dd>
    </dl>
    ${warnings.length ? `<ul class="warnings">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  </section>
  <section class="card"><h2>Корпуса (${s.bodies.length})</h2><table><thead><tr><th>Корпус</th><th>Ш × В × Г, мм</th><th>Основание, задняя стенка</th><th>Наполнение</th></tr></thead><tbody>${s.bodies
    .map((b: any) => `<tr><td>${esc(b.id)}<div class="muted">${esc(b.kind)}</div></td><td>${mm(b.width)} × ${mm(b.height)} × ${mm(b.depth)}</td><td>${esc(b.base ? `${b.base.kind}${b.base.height ? ` ${mm(b.base.height)} мм` : ''}` : '—')}, ${esc(b.back)}</td><td>${esc(fill(b))}</td></tr>`)
    .join('')}</tbody></table></section>`;
}

/** Секции шкафа слева направо, затем антресоль: фасад и наполнение. */
function wardrobeSections(s: any): string {
  const fill = (x: any) =>
    [
      x.shelves ? `полок ${x.shelves}` : null,
      x.rods.length ? `штанга${x.rods.length > 1 ? ` ×${x.rods.length}` : ''} (верх ${x.rods.map((r: any) => mm(r.top_from_floor_mm)).join(', ')} мм от пола)` : null,
      ...x.drawers.map((d: any) => `ящик ${d.execution}`),
      ...x.storage,
      x.lit ? 'подсветка' : null,
    ]
      .filter(Boolean)
      .join(', ') || 'пусто';
  return `<section class="card"><h2>Секции (${s.sections.length})</h2><table><thead><tr><th>№</th><th>Ширина, мм</th>${s.sliding ? '' : '<th>Фасад</th>'}<th>Наполнение</th></tr></thead><tbody>${s.sections
    .map(
      (x: any) =>
        `<tr><td>${x.section + 1}${x.mezzanine ? '<div class="muted">антресоль</div>' : ''}</td><td>${mm(x.width_mm)}</td>${s.sliding ? '' : `<td>${esc(x.facade)}${x.hinge_side ? `<div class="muted">петли ${esc(x.hinge_side)}</div>` : ''}</td>`}<td>${esc(fill(x))}</td></tr>`,
    )
    .join('')}</tbody></table></section>`;
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

const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--ink:#1b1f2a;--muted:#6b6f7a;--line:#d9d7d0;--accent:#3b5bdb;--ok:#2f7d4f;--okbg:#e6f4ec;--part:#9a5b00;--partbg:#fff3df;
--m-base:#e9dcc4;--m-niche:#f1ece2;--m-upper:#dbe6f3;--m-tall:#d9d2ee;--m-mezz:#e4e0f2;--m-island:#d8eadf;--zone:#0000;--human:#eef1fb;--ai:#f3f2ee;--v3d-bg:#eceae4}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171c;--card:#1e2128;--ink:#e8e8ea;--muted:#9a9ea8;--line:#343843;--accent:#8ea6ff;--ok:#7fd3a0;--okbg:#1d3328;--part:#f0b75a;--partbg:#3a2c14;
--m-base:#5a4b33;--m-niche:#3c3a34;--m-upper:#2f4258;--m-tall:#463d63;--m-mezz:#3d3954;--m-island:#2f4a3a;--human:#252b3d;--ai:#262830;--v3d-bg:#2a2d35}}
:root[data-theme="dark"]{--bg:#15171c;--card:#1e2128;--ink:#e8e8ea;--muted:#9a9ea8;--line:#343843;--accent:#8ea6ff;--ok:#7fd3a0;--okbg:#1d3328;--part:#f0b75a;--partbg:#3a2c14;
--m-base:#5a4b33;--m-niche:#3c3a34;--m-upper:#2f4258;--m-tall:#463d63;--m-mezz:#3d3954;--m-island:#2f4a3a;--human:#252b3d;--ai:#262830;--v3d-bg:#2a2d35}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.top{padding:12px 16px 0}.top h1{font-size:18px;margin:0}.top p{margin:2px 0 0}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 10px}
.muted{color:var(--muted);font-size:13px}
.stage{display:grid;grid-template-columns:minmax(0,1fr);padding:16px;height:calc(100vh - 62px);min-height:480px}
.stage-3d{min-height:0;display:flex;flex-direction:column}.stage-3d>.card{flex:1;min-height:0;display:flex;flex-direction:column}
.stage-3d .v3d{flex:1;height:auto;min-height:320px}
.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;padding:0 16px 16px;align-items:start}
@media (max-width:860px){.stage{height:auto}.stage-3d .v3d{height:70vh;flex:none}}
.col{display:flex;flex-direction:column;gap:16px;min-width:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}
.price .badge{display:inline-block;font-weight:600;font-size:13px;padding:2px 10px;border-radius:99px}
.price.ok .badge{background:var(--okbg);color:var(--ok)}.price.partial .badge{background:var(--partbg);color:var(--part)}
.price .sum{font-size:24px;font-weight:650;margin:6px 0 2px}.sum2{font-size:20px;font-weight:650;margin:0 0 4px}
.price ul{margin:6px 0 0;padding-left:18px;font-size:13px}
.facts{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0}.facts dt{color:var(--muted)}.facts dd{margin:0}
.warn{color:var(--part)}.warnings{color:var(--part);margin:10px 0 0;padding-left:18px}
.v3d{position:relative;height:460px;border-radius:8px;overflow:hidden;background:var(--v3d-bg)}.view3d{position:absolute;inset:0;overflow:hidden}.view3d canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}.view3d-status{position:absolute;left:12px;bottom:10px;margin:0;color:var(--muted);font-size:13px}
.v3d-price{position:absolute;left:10px;bottom:10px;z-index:1;padding:5px 12px;border-radius:8px;background:var(--card);border:1px solid var(--line);font-size:15px;font-weight:600;color:var(--ink)}.v3d-price.partial{border-color:var(--warn,#b45309)}
.v3d-bar{position:absolute;top:8px;left:8px;z-index:1;display:flex;flex-wrap:wrap;gap:6px}.v3d-bar button{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:3px 10px;cursor:pointer}.v3d-bar button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
@media (max-width:560px){.v3d{height:340px}}
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
.who{font-size:12px;color:var(--muted);margin-bottom:2px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--accent);color:var(--accent);border-radius:99px;padding:2px 10px;font-size:13px}
footer{padding:0 16px 24px}
`;

const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

let module3d: string | null = null;
/** Сборка 3D-вида конструктора (apps/web/src/view3d на закреплённом SHA, npm run engine:setup) — текстом в страницу. */
function view3dModule(): string {
  module3d ??= readFileSync(join(engineDir(), 'view3d.js'), 'utf8').replaceAll('</script', '<\\/script');
  return module3d;
}

/**
 * Файлы моделей каталога, которые называет сцена (scene.models[].file, MOD-DEC-536), — base64 из копии каталога
 * (catalogs/hardware/models на закреплённом SHA). 3D-вид грузит их по адресу data: и сверяет sha256 с каталогом;
 * без файла он рисует параметрическую модель (корзина — коробом из пластин).
 */
function modelFiles(scene: { models?: { file: string }[] }): Record<string, string> {
  const files = [...new Set((scene.models ?? []).map((m) => m.file))].sort();
  return Object.fromEntries(files.flatMap((f) => {
    const path = join(engineDir(), 'catalogs/hardware', f);
    return existsSync(path) ? [[f, readFileSync(path).toString('base64')]] : [];
  }));
}

let moduleExplode: string | null = null;
/**
 * Ходы деталей «Взрыва» — функции ядра explodeOffsets и explodeLift (packages/core/src/engine/explode.ts на закреплённом
 * SHA), и правила створок купе slidePose и slideClears (engine/motion.ts, MOD-DEC-571), как их даёт 3D-виду редактор;
 * и посадку файлов моделей каталога в их место modelLocal, modelDirection, modelMirrored (engine/scene.ts, MOD-DEC-536);
 * собираются esbuild из копии ядра без изменений.
 */
function explodeModule(): string {
  moduleExplode ??= buildSync({
    stdin: {
      contents: "export { explodeOffsets, explodeLift } from './explode.ts'; export { slidePose, slideClears } from './motion.ts'; export { modelLocal, modelDirection, modelMirrored } from './scene.ts';",
      resolveDir: join(engineDir(), 'packages/core/src/engine'),
      loader: 'ts',
    },
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'ModuleroExplode',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  }).outputFiles[0]!.text.replaceAll('</script', '<\\/script');
  return moduleExplode;
}

/**
 * Запуск 3D-вида конструктора на странице, как его запускает редактор кухни (view3d-host.ts): create с видом декоров,
 * затем update сцены с показом фасадов. «Рентген» и «Взрыв» — режимы того же вида (display.xray, display.explode):
 * «Взрыв», как в редакторе, — только в «Рентгене», поэтому включает и его. Нажатие на дверь или ящик открывает
 * и закрывает его (toggleMotion вида), на створку купе — сдвигает её к дальнему краю хода и обратно (moveLeaves по правилам
 * ядра: створка останавливается у соседней на своей дорожке). Без WebGL — статичное превью ядра.
 */
const VIEWER = `(()=>{
const D=JSON.parse(document.getElementById('scene3d').textContent),F=JSON.parse(document.getElementById('models3d').textContent),host=document.getElementById('v3d');
const fail=t=>{host.closest('.v3d').hidden=true;const f=document.querySelector('.v3d-fallback');f.hidden=false;f.insertAdjacentHTML('afterbegin','<p class="muted">3D недоступен: '+t+'</p>');};
try{
  const M=window.ModuleroView3D;host.replaceChildren();
  const E=window.ModuleroExplode;
  const slide=m=>{const l=v.motion.systems().find(x=>x.some(y=>y.key===m.key));if(!l)return;const p=v.motion.slidePositions(l,true),i=l.indexOf(m),far=m.closedMm-m.minMm>m.maxMm-m.closedMm?m.minMm:m.maxMm;p[i]=Math.abs(p[i]-m.closedMm)<1?far:m.closedMm;v.moveLeaves(m.mechanismId,p);};
  const v=M.create(host,part=>{const m=part&&v.motion.of(part.id);if(m)m.kind==='slide'?slide(m):v.toggleMotion(m.key);},{decor:id=>D.looks[id]||null,explode:E?{offsets:E.explodeOffsets,lift:E.explodeLift}:undefined,slides:E?{pose:E.slidePose,clears:E.slideClears}:undefined,models:E?{local:E.modelLocal,direction:E.modelDirection,mirrored:E.modelMirrored,url:f=>F[f]?'data:model/gltf-binary;base64,'+F[f]:null}:undefined});
  if(v.error){fail(v.error);return;}
  let display={fronts:true,neutral:false};v.update(D.scene,display);
  const btn=a=>document.querySelector('.v3d-bar [data-act='+a+']');
  btn('fronts').onclick=e=>{display={...display,fronts:!display.fronts};e.target.setAttribute('aria-pressed',String(display.fronts));v.update(D.scene,display);};
  btn('neutral').onclick=e=>{display={...display,neutral:!display.neutral};e.target.setAttribute('aria-pressed',String(display.neutral));v.update(D.scene,display);};
  const openText=()=>{const d=v.motion.doors();btn('open').textContent=d.length&&d.every(x=>v.motion.isOpen(x.key))?'Закрыть фасады':'Открыть фасады';};
  btn('open').onclick=()=>v.toggleAll();
  host.addEventListener('motionchange',openText);
  const press=(a,on)=>btn(a).setAttribute('aria-pressed',String(on));
  btn('xray').onclick=()=>{const on=!display.xray;display={...display,xray:on,explode:on?display.explode||0:0};press('xray',on);press('explode',!!display.explode);v.update(D.scene,display);};
  btn('explode').onclick=()=>{const on=!display.explode;display={...display,xray:display.xray||on,explode:on?1:0};press('xray',display.xray);press('explode',on);v.update(D.scene,display);};
  if(!E)btn('explode').hidden=true;
  btn('fit').onclick=()=>v.fit();
  if(!v.motion.doors().length)btn('open').hidden=true;
}catch(e){fail(String(e));}
})();`;
