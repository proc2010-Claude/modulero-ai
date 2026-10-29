// The colour of the HDF back panel matched to the carcass decor: RA05 of the prototype r1 (ra05Resolve
// r1.html:64985, ra05Winner r1.html:64972). The nearest Kronospan HDF of the palette by the CIELAB distance of the
// mean colours; a tie goes to the smaller id in UTF-8 order. The match is approximate and visual only: the physical
// colour of the back panel is confirmed apart. Data: back-panels.data.json (scripts/gen-back-panels.mjs).
import data from './back-panels.data.json' with { type: 'json' };

/** The record the prototype writes in appearanceSelection.backPanel for a chosen carcass decor (RA05-BACK-1). */
export interface BackPanelMatch {
  schema: 'RA05-BACK-1';
  status: 'MATCHED_APPROXIMATE' | 'MISSING_CORPUS_REPRESENTATIVE';
  stable_id: string | null;
  corpusDecorId: string;
  paletteVersion: string;
  algorithmVersion: string;
  corpusAssetSha256: string | null;
  migrationReason: null;
}

const utf8 = (a: string, b: string): number => {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) return x[k]! - y[k]!;
  return x.length - y.length;
};

/** The nearest back panel of the palette (ra05Winner): the distance rounded to 1e-6 as the prototype bins it. */
function winner(lab: readonly number[]): string {
  let best: string | null = null,
    bin = Infinity;
  for (const r of data.hdf) {
    const q = Math.floor(r.labD65.reduce((sum, v, k) => sum + (lab[k]! - v) ** 2, 0) * 1e6 + 0.5);
    if (q < bin || (q === bin && (best === null || utf8(r.stable_id, best) < 0))) {
      best = r.stable_id;
      bin = q;
    }
  }
  return best!;
}

/** The back panel of a chosen carcass decor (ra05Resolve with `chosen`); a decor without a sample is not matched. */
export function backPanelFor(decorId: string): BackPanelMatch {
  const corpus = data.corpus.find((c) => c.corpusDecorId === decorId);
  return {
    schema: 'RA05-BACK-1',
    status: corpus ? 'MATCHED_APPROXIMATE' : 'MISSING_CORPUS_REPRESENTATIVE',
    stable_id: corpus ? winner(corpus.labD65) : null,
    corpusDecorId: decorId,
    paletteVersion: data.paletteVersion,
    algorithmVersion: data.algorithmVersion,
    corpusAssetSha256: corpus?.corpusAssetSha256 ?? null,
    migrationReason: null,
  };
}
