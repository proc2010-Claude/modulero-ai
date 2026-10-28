// The hardware of a kitchen on the stage «Детали» (R4-010, FINDINGS 1892): the hardware rows of the BOM, the rows the
// specification CSV carries with category=hardware. Rows of one module with the same article, name and unit are one
// line, their quantities added; an unknown quantity stays unknown, never a zero.
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
}

const UNITS: Record<string, string> = { piece: 'шт', m: 'м' };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
        unit: UNITS[r.unit] ?? String(r.unit ?? ''),
        withAppliance,
        rows: 1,
      });
  }
  return [...lines.values()];
}
