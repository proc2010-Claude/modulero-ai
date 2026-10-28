// Сверка побайтно хранимых входов (reference/**) с их SHA256SUMS.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ShaMismatch {
  file: string;
  expected: string;
  actual: string | null;
}

export function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Сверяет файлы каталога с его SHA256SUMS (формат sha256sum). */
export function verifyShaSums(dir: string): { checked: number; mismatches: ShaMismatch[] } {
  const lines = readFileSync(join(dir, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean);
  const mismatches: ShaMismatch[] = [];
  for (const line of lines) {
    const [expected, file] = line.split(/\s+\*?/, 2);
    let actual: string | null = null;
    try {
      actual = sha256(join(dir, file));
    } catch {
      actual = null;
    }
    if (actual !== expected) mismatches.push({ file, expected, actual });
  }
  return { checked: lines.length, mismatches };
}
