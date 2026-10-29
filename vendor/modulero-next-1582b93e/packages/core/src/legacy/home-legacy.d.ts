// Type surface of the quarantined legacy model (see scripts/gen-legacy.mjs).
// Typed loosely on purpose: it is used only for migration and differential tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LegacyHomeModel = Record<string, any>;
export const LEGACY_HOME_SHA256: string;
export function createLegacyHomeModel(options?: { randomUUID?: () => string }): LegacyHomeModel;
