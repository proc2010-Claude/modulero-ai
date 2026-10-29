// The browser draft of the wardrobe and its variants (task U2): the draft of a project (project/draft.ts) whose
// variants are wardrobe inputs, checked by normalizeWardrobeInput when the draft is read back.
import * as P from '../project/draft.js';
import { normalizeWardrobeInput, type WardrobeInput } from './input.js';

export { MAX_VARIANTS, MAX_VARIANT_NAME, activeVariant, withInput, addVariant, selectVariant, renameVariant, removeVariant, draftText } from '../project/draft.js';

export const WARDROBE_DRAFT_SCHEMA = 'modulero.wardrobe-draft/1';

export type WardrobeVariant = P.Variant<WardrobeInput>;
export type WardrobeDraft = P.Draft<WardrobeInput>;
export type DraftResult = P.DraftResult<WardrobeInput>;

/** A draft of one variant «Основной» with this wardrobe input. */
export const newDraft = (input: WardrobeInput): WardrobeDraft => P.newDraft(WARDROBE_DRAFT_SCHEMA, input);

/** The wardrobe draft of a stored text, or null when it is not one or a variant is not a valid wardrobe input. */
export const readDraft = (text: string | null): WardrobeDraft | null => P.readDraft(text, WARDROBE_DRAFT_SCHEMA, normalizeWardrobeInput);
