export const ROOT: string;
export const PIN: { repo: string; sha: string; hardwareCatalog: string; paths: string[]; decision: string; dir: string; manifestSha256: string };
export function engineDir(): string;
export function manifest(dir: string): string;
