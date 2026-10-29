// The browser draft of other furniture and its variants (R1-003 of the pilot; FINDINGS 1321): the draft of a project
// (project/draft.ts) whose variants are home projects of the current rule set, checked by validate when read back.
import * as P from '../project/draft.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { HomeProject } from './types.js';
import { clone } from './geometry.js';
import { isCurrent, ratesForR4 } from './migrate.js';
import { validate } from './validate.js';

export { MAX_VARIANTS, MAX_VARIANT_NAME, activeVariant, withInput, addVariant, selectVariant, renameVariant, removeVariant, draftText } from '../project/draft.js';

export const HOME_DRAFT_SCHEMA = 'modulero.home-draft/1';

export type HomeDraft = P.Draft<HomeProject>;
export type DraftResult = P.DraftResult<HomeProject>;

/** A draft of one variant «Основной» with this project. */
export const newDraft = (project: HomeProject): HomeDraft => P.newDraft(HOME_DRAFT_SCHEMA, project);

/**
 * The home draft of a stored text, or null when it is not one or a variant does not open in the current rule set. A
 * variant of an earlier rule set is not updated here: the update of the construction asks the user (MOD-DEC-351), so
 * such a draft is not read and «Продолжить» opens the autosaved project through the update dialog, as before.
 */
export const readDraft = (text: string | null, hw: HardwareCatalogs): HomeDraft | null =>
  P.readDraft(text, HOME_DRAFT_SCHEMA, (input) => {
    if (!isCurrent(input)) throw new Error('rule set');
    const p = clone(input);
    // A draft saved before MOD-DEC-510: the rates the cutting plan replaced are cleared, as when a file is opened.
    const rates = ratesForR4(p.rates);
    if (rates) p.rates = rates.rates;
    return validate(p, hw);
  });
