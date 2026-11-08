import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { PDFParse } from "pdf-parse";
import { readCv } from "./helpers/content.ts";

// Reads the real dist/andrius-riauba-cv.pdf written by `npm run build:pdf`
// (scripts/build-pdf.mjs), which `make build`/`make e2e` run before this
// suite. Not driven through a `page` fixture: this test parses a binary
// file already on disk (see ADR-0002), it needs no browser of its own.
const pdfPath = fileURLToPath(
  new URL("../../dist/andrius-riauba-cv.pdf", import.meta.url),
);

test.describe("dist/andrius-riauba-cv.pdf", () => {
  test("contains selectable text including basics.name (AC-4)", async () => {
    const cv = readCv();
    const parser = new PDFParse({ data: readFileSync(pdfPath) });
    const result = await parser.getText();
    await parser.destroy();
    expect(result.text).toContain(cv.basics.name);
  });

  test("embeds Lithuanian latin-ext glyphs as real selectable text, not tofu/rasterized (decision #6)", async () => {
    const parser = new PDFParse({ data: readFileSync(pdfPath) });
    const result = await parser.getText();
    await parser.destroy();
    expect(result.text).toContain("Registrų Centras");
  });

  test("is at most 2 pages (AC-3, hard ceiling)", async () => {
    const parser = new PDFParse({ data: readFileSync(pdfPath) });
    const result = await parser.getText();
    await parser.destroy();
    expect(result.total).toBeLessThanOrEqual(2);
  });
});
