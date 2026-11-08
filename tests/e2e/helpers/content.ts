import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Playwright test files run under Node's own ESM loader, not Vite, so they
// cannot import src/lib/cv.ts (which uses a Vite-only `?raw` import to stay
// correct no matter how `astro build` bundles it — see the comment in
// src/lib/cv.ts). E2e tests instead read content/cv.yaml directly with
// plain fs + the `yaml` package to build expectations against the real
// content; schema validation itself is already covered by
// tests/unit/cv.schema.test.ts.
const cvPath = fileURLToPath(
  new URL("../../../content/cv.yaml", import.meta.url),
);

export interface Profile {
  network: string;
  url: string;
}

export interface CvBasics {
  name: string;
  email: string;
  profiles: Profile[];
  [key: string]: unknown;
}

export interface Cv {
  basics: CvBasics;
  [key: string]: unknown;
}

export function readCv(): Cv {
  return parseYaml(readFileSync(cvPath, "utf-8")) as Cv;
}
