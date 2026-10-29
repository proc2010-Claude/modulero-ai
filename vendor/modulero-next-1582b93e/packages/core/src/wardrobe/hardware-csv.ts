// The hardware of a wardrobe as a CSV file (R3-008 of the pilot, stage 3; FINDINGS 1803): the nodes of the graph as
// the table «Фурнитура» of the stage «Детали» shows them, one row per node, with the same name, count and status. The
// specification stays the prototype's file of the parts; the priced kit is in the estimate and the production package.
import type { Graph, Mechanism } from '../engine/contract.js';
import { rowsToCsv } from './exports.js';

/** The names of the nodes of a wardrobe, as the stage «Детали» shows them. */
export const MECHANISM_NAMES: Readonly<Record<string, string>> = Object.freeze({
  SLIDING_SYSTEM: 'Двери-купе ARISTO',
  FACADE_LIFT: 'Подъёмник',
  HINGE: 'Петля',
  ANTI_TIP: 'Крепление к стене (от опрокидывания)',
  SUPPORT_LEG: 'Ножки',
  HANDLE: 'Ручки',
  DRAWER_RUNNER: 'Направляющие',
  CLOTHES_ROD: 'Штанга',
  SHELF_SUPPORT: 'Полкодержатели',
  // The nodes of the fittings (MOD-DEC-483, 484): the table showed their codes («LIGHT», «BASKET»).
  LIGHT: 'Светильник',
  POWER_SUPPLY: 'Блок питания подсветки',
  PUSH_LATCH: 'Толкатель',
  BASKET: 'Корзина выдвижная',
  TROUSER_RACK: 'Вешало для брюк',
  PANTOGRAPH: 'Пантограф',
});

/** The status of a node in words. */
export const CAPABILITY_NAMES: Readonly<Record<string, string>> = Object.freeze({ RESOLVED: 'подобрано', PLACEHOLDER: 'заглушка', HOLD: 'нет данных — ждёт решения' });

/** A count the graph does not know (a placeholder, or no article and 0) is shown as unknown, never as zero. */
export const knownQuantity = (m: Mechanism) => (m.capability.status !== 'PLACEHOLDER' || (m.profile.version !== null && m.quantity > 0)) && !(m.profile.catalogId === 'UNKNOWN' && m.quantity === 0);

/** The article of a node, or empty when the graph has none. */
const article = (m: Mechanism) => (m.profile.catalogId === 'UNKNOWN' || m.profile.catalogId === 'NONE' ? '' : m.profile.catalogId);

/** The name of a node with its article, as in the table of the stage «Детали». */
export const mechanismTitle = (m: Mechanism) => (MECHANISM_NAMES[m.kind] ?? m.kind) + (m.profile.catalogId === 'UNKNOWN' ? '' : ` ${m.profile.catalogId}`);

/** The hardware CSV: a row per node of the graph, in the order of the table on the screen. */
export function hardwareCsv(g: Pick<Graph, 'mechanisms'>): string {
  const rows: unknown[][] = [['№', 'Узел', 'Артикул', 'Кол-во', 'Состояние', 'ID узла', 'Причина']];
  g.mechanisms.forEach((m, i) => rows.push([i + 1, MECHANISM_NAMES[m.kind] ?? m.kind, article(m), knownQuantity(m) ? m.quantity : '—', CAPABILITY_NAMES[m.capability.status] ?? m.capability.status, m.id, m.capability.reason ?? '']));
  return rowsToCsv(rows);
}
