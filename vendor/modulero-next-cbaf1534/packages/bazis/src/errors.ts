/**
 * Offset spaces. A BZ85 file has several byte streams and an offset is meaningful only inside one:
 * `null` is the source file itself; the others name the decoded stream the offset belongs to.
 * Nested documents (JointData, Scheme) use `nested:<locator>` for their decoded bytes and
 * `stored:<locator>` for the bytes as stored in the parent.
 */
export type OffsetSpace = string | null;

/** A refusal with the place where the data stopped making sense. Nothing is skipped or guessed. */
export class BazisError extends Error {
  readonly detail: string;
  offset: number | null;
  offsetSpace: OffsetSpace;
  /** Whether `offset` counts decoded bytes ("decoded") or bytes as stored in the parent ("stored"). */
  region: 'stored' | 'decoded' = 'stored';
  /** Set once the error has been attributed to the innermost nested document. */
  attributed = false;

  constructor(detail: string, offset: number | null = null, offsetSpace: OffsetSpace = null) {
    super(offset === null ? detail : `${detail} at offset 0x${offset.toString(16).toUpperCase()}`);
    this.name = 'BazisError';
    this.detail = detail;
    this.offset = offset;
    this.offsetSpace = offsetSpace;
  }
}
