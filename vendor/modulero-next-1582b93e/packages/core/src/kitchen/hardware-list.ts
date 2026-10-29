// The hardware of a kitchen on the stage «Детали» (R4-010, FINDINGS 1892): the hardware rows of the BOM, the rows the
// specification CSV carries with category=hardware. Rows of one module with the same article, name and unit are one
// line, their quantities added; an unknown quantity stays unknown, never a zero. The screen names a line in Russian
// (`title`, `code`): the BOM and the CSV keep the names of the prototype (R1-003 of the retest, FINDINGS 2711).
import type { Rec } from '../engine/policy/project-state.js';

export interface KitchenHardwareLine {
  moduleId: string;
  name: string;
  article: string;
  brand: string;
  /** null — a row of the line has no quantity. */
  quantity: number | null;
  unit: string;
  /** Delivered with the appliance, not bought for the kitchen. */
  withAppliance: boolean;
  /** How many rows of the BOM CSV the line adds up. */
  rows: number;
  /** The name on the screen: Russian, or the brand and the article of a row named by its article alone. */
  title: string;
  /** The article on the screen; empty when the title already says it. */
  code: string;
}

const UNITS: Record<string, string> = { piece: 'шт', m: 'м', set: 'компл.', kit: 'компл.', pair: 'пар', pairs: 'пар' };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** The unit of a row of the BOM in words: «шт», «пар», «м». */
export const kitchenUnit = (unit: unknown): string => UNITS[String(unit)] ?? String(unit ?? '');

/**
 * The service names of the rows of the kitchen (the kits of the appliances, appliances.data.json; the fixings of the
 * joints, hardware.ts) in Russian. The words of the documents of the makers, not new rules; a name not here is shown
 * as it is.
 */
const TITLES: Readonly<Record<string, string>> = {
  // The kits of the appliances.
  'basket-strainer-with-remote-control': 'Донный клапан с дистанционным управлением',
  'manufacturer-mounting-kit': 'Монтажный комплект производителя',
  'vapor-protection': 'Пароизоляционная накладка',
  'recirculation-kit': 'Комплект для рециркуляции',
  'furniture-door-hinges': 'Петли мебельной двери',
  'magnetic-catches-and-counterplates': 'Магнитные защёлки с ответными планками',
  'transport-cover-caps': 'Заглушки транспортировочных отверстий',
  machine: 'Прибор',
  'connecting cable': 'Сетевой кабель',
  'assembly bracket': 'Монтажный кронштейн',
  spacers: 'Проставки',
  'silver fastening screws': 'Винты крепёжные серебристые',
  'long black screws': 'Винты чёрные длинные',
  'short black screws': 'Винты чёрные короткие',
  'black sleeve': 'Втулка чёрная',
  'white sleeves': 'Втулки белые',
  // The fixings of the joints and the parts of the cards.
  'caps-to-two-sides': 'Крепление крышек к двум боковинам',
  'caps-to-four-verticals': 'Крепление крышек к четырём стойкам',
  'divider-to-side': 'Крепление перегородки к боковине',
  'bottom-lamination': 'Скрепление слоёв дна',
  'frame-butt-joints': 'Крепление стыков рамки',
  'skin-to-carcass': 'Крепление облицовки к корпусу',
  'dry-base-layer-fastening': 'Крепление слоёв основания без клея',
  // R4-004 of the tester (FINDINGS 2909): the kinds of the joints the bell names.
  'physical-corner-filler-to-carcass': 'Крепление углового добора к корпусу',
  'worktop-to-structural-end-panels': 'Крепление столешницы к торцевым панелям',
  'waterproof compatible worktop joint sealing service': 'Влагостойкая герметизация стыка столешницы (работа)',
  'substrate specific anchor/screw set': 'Анкеры или шурупы по материалу стены, комплект',
  'chipboard screw3.1x16': 'Саморез по ДСП 3,1 × 16',
  'chipboard screw3.1x20': 'Саморез по ДСП 3,1 × 20',
  'side wood screw4x16': 'Шуруп 4 × 16 боковины',
  'front wood screw4x16': 'Шуруп 4 × 16 фасада',
  'M5 nut': 'Гайка M5',
  'C150 left chrome wire': 'Бутылочница C150 левая, хромированная проволока',
  'FISSO two levels600 anthracite': 'Сушка FISSO двухуровневая 600, антрацит',
};
/** A service name of the kitchen in Russian, or the name itself when the dictionary has none (the bell, R4-004). */
export const kitchenServiceTitle = (name: string): string => TITLES[name] ?? name;

/** The brand of a row the project specifies itself, not a maker: not shown. */
const NO_BRAND = new Set(['PROJECT_SPECIFICATION']);
/** The kit of an appliance, as the catalogue names it: «WIW28302GB-factory-installation-set», «WIW28302GB installation kit». */
const SET = /^(.+)-factory-installation-set$/,
  KIT = /^(.+) installation kit$/;

/** The name and the article of a line on the screen. */
export function kitchenHardwareTitle(name: string, article: string, brand: string): { title: string; code: string } {
  const set = SET.exec(name),
    kit = KIT.exec(article),
    shown = NO_BRAND.has(brand) ? '' : brand;
  if (set) return { title: `Монтажный комплект ${set[1]}`, code: '' };
  const title = TITLES[name] ?? (name === article && shown ? `${shown} ${name}` : name);
  return { title, code: kit ? `комплект ${kit[1]}` : article === name ? '' : article };
}

export function kitchenHardwareLines(bom: Rec): KitchenHardwareLine[] {
  const lines = new Map<string, KitchenHardwareLine>();
  for (const r of (bom.rows ?? []) as Rec[]) {
    if (r.category !== 'hardware') continue;
    const withAppliance = r.includedWithAppliance === true,
      key = JSON.stringify([r.moduleId, r.article, r.name, r.unit, withAppliance]),
      line = lines.get(key);
    if (line) {
      line.quantity = line.quantity !== null && finite(r.quantity) ? Math.round((line.quantity + r.quantity) * 1000) / 1000 : null;
      line.rows++;
    } else
      lines.set(key, {
        moduleId: String(r.moduleId ?? ''),
        name: String(r.name ?? r.article ?? ''),
        article: String(r.article ?? ''),
        brand: String(r.brand ?? ''),
        quantity: finite(r.quantity) ? r.quantity : null,
        unit: kitchenUnit(r.unit),
        withAppliance,
        rows: 1,
        ...kitchenHardwareTitle(String(r.name ?? r.article ?? ''), String(r.article ?? ''), String(r.brand ?? '')),
      });
  }
  return [...lines.values()];
}
