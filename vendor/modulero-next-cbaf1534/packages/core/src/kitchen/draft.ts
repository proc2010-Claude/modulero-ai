// The browser draft of the kitchen and its variants (R1-001, R1-003 of the pilot; FINDINGS 1320): the draft of a
// project (project/draft.ts) whose variants are kitchen projects, checked by kitchenProjectFromRecord when read back.
import * as P from '../project/draft.js';
import { kitchenProjectFromRecord, type KitchenProject } from './project.js';

export { MAX_VARIANTS, MAX_VARIANT_NAME, activeVariant, withInput, addVariant, selectVariant, renameVariant, removeVariant, draftText } from '../project/draft.js';

export const KITCHEN_DRAFT_SCHEMA = 'modulero.kitchen-draft/1';

export type KitchenDraft = P.Draft<KitchenProject>;
export type DraftResult = P.DraftResult<KitchenProject>;

/** A draft of one variant «Основной» with this kitchen. */
export const newDraft = (project: KitchenProject): KitchenDraft => P.newDraft(KITCHEN_DRAFT_SCHEMA, project);

/** The kitchen draft of a stored text, or null when it is not one or a variant is not a kitchen that opens. */
export const readDraft = (text: string | null): KitchenDraft | null => P.readDraft(text, KITCHEN_DRAFT_SCHEMA, kitchenProjectFromRecord);
