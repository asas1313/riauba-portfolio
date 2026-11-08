// Spec 003, AC-6: reads every real spec file in docs/specs/ at build time,
// for the "How this site was built" page's spec list. Uses a Vite
// `import.meta.glob` raw import (resolved against the project root at
// transform time) rather than `node:fs` + a computed path, for the same
// chunk-relocation reason documented for `cv.ts`'s single-file `?raw`
// import in ADR-0001 — just via the glob form, since the spec file set is
// open-ended (grows by one file per future spec) rather than a single
// known path.
const rawSpecFiles = import.meta.glob("/docs/specs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Matches a spec file's own filename convention; excludes `_TEMPLATE.md`,
 * `*.plan.md` and `*.log.md`. */
const SPEC_FILENAME_PATTERN = /^\d{3}-[\w-]+\.md$/;

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Every real spec file's raw contents, keyed by filename (e.g.
 * `"001-site-foundation.md"`). */
const specFilesByFilename: Record<string, string> = Object.fromEntries(
  Object.entries(rawSpecFiles)
    .map(([path, raw]) => [basename(path), raw] as const)
    .filter(([filename]) => SPEC_FILENAME_PATTERN.test(filename)),
);

/** Reads one real spec file's raw contents by filename (e.g.
 * `"001-site-foundation.md"`); throws if there is no such file. */
export function readSpecFileRaw(filename: string): string {
  const raw = specFilesByFilename[filename];
  if (raw === undefined) {
    throw new Error(`specs: no spec file found for "${filename}"`);
  }
  return raw;
}

export interface SpecIndexEntry {
  number: number;
  title: string;
  status: string;
  pr?: string;
}

const H1_PATTERN = /^#\s+(\d{3})\s+–\s+(.+?)\s*$/m;
const STATUS_PATTERN = /^Status:\s*(.+?)\s*(?:·|$)/m;
const PR_PATTERN = /^PR:\s*(\S+)\s*$/m;

/**
 * Parses `{ number, title, status, pr? }` out of one spec file's raw
 * markdown, per the project's `# NNN – Title` / `Status: ...` / optional
 * `PR: <url>` header convention. Fails loudly (per this project's
 * convention) rather than silently guessing:
 *
 * - throws if the file has no `# NNN – Title` first-line heading;
 * - throws if the filename's own leading number disagrees with the H1's
 *   (a copy-paste or rename mistake);
 * - throws if there is no `Status: ...` line.
 */
export function parseSpecIndexEntry(
  raw: string,
  filename: string,
): SpecIndexEntry {
  const h1 = H1_PATTERN.exec(raw);
  if (!h1) {
    throw new Error(
      `specs: "${filename}" has no "# NNN – Title" heading on its own line`,
    );
  }
  const [, numberText, title] = h1;
  const number = Number(numberText);

  const filenameMatch = /^(\d{3})-/.exec(filename);
  const filenameNumber = filenameMatch ? Number(filenameMatch[1]) : undefined;
  if (filenameNumber !== undefined && filenameNumber !== number) {
    throw new Error(
      `specs: "${filename}"'s filename number (${filenameMatch![1]}) disagrees with its heading's number (${numberText})`,
    );
  }

  const statusMatch = STATUS_PATTERN.exec(raw);
  if (!statusMatch) {
    throw new Error(`specs: "${filename}" has no "Status: ..." line`);
  }
  const status = statusMatch[1];

  const prMatch = PR_PATTERN.exec(raw);
  const pr = prMatch ? prMatch[1] : undefined;

  return { number, title, status, pr };
}

/** Every real spec in `docs/specs/`, sorted ascending by number (AC-6). */
export function getSpecIndex(): SpecIndexEntry[] {
  return Object.entries(specFilesByFilename)
    .map(([filename, raw]) => parseSpecIndexEntry(raw, filename))
    .sort((a, b) => a.number - b.number);
}
