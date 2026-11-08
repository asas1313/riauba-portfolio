import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getSpecIndex,
  parseSpecIndexEntry,
  readSpecFileRaw,
} from "../../src/lib/specs.ts";

const specsDir = fileURLToPath(new URL("../../docs/specs/", import.meta.url));

describe("parseSpecIndexEntry", () => {
  it("parses number, title and status from the standard header", () => {
    const raw = [
      "# 007 – A test spec",
      "",
      "Status: Final  ·  Owner: Andrius  ·  Date: 2026-01-01",
      "",
      "## Goal",
    ].join("\n");
    expect(parseSpecIndexEntry(raw, "007-a-test-spec.md")).toEqual({
      number: 7,
      title: "A test spec",
      status: "Final",
      pr: undefined,
    });
  });

  it("parses an optional PR line when present", () => {
    const raw = [
      "# 007 – A test spec",
      "",
      "Status: Final  ·  Owner: Andrius  ·  Date: 2026-01-01",
      "PR: https://github.com/example/repo/pull/42",
      "",
      "## Goal",
    ].join("\n");
    expect(parseSpecIndexEntry(raw, "007-a-test-spec.md").pr).toBe(
      "https://github.com/example/repo/pull/42",
    );
  });

  it("leaves pr undefined when the PR line is absent", () => {
    const raw = [
      "# 007 – A test spec",
      "",
      "Status: Draft  ·  Owner: Andrius  ·  Date: 2026-01-01",
    ].join("\n");
    expect(parseSpecIndexEntry(raw, "007-a-test-spec.md").pr).toBeUndefined();
  });

  it("throws a readable error when the filename's leading number disagrees with the H1's", () => {
    const raw = [
      "# 007 – A test spec",
      "",
      "Status: Final  ·  Owner: Andrius  ·  Date: 2026-01-01",
    ].join("\n");
    expect(() => parseSpecIndexEntry(raw, "008-a-test-spec.md")).toThrow(
      /007.*008|008.*007/,
    );
  });

  it("throws a readable error when the H1 line is missing or malformed", () => {
    const raw = ["Not a heading at all", "", "Status: Final"].join("\n");
    expect(() => parseSpecIndexEntry(raw, "007-a-test-spec.md")).toThrow(
      /heading|H1|title/i,
    );
  });

  it("throws a readable error when the Status line is missing", () => {
    const raw = ["# 007 – A test spec", "", "## Goal"].join("\n");
    expect(() => parseSpecIndexEntry(raw, "007-a-test-spec.md")).toThrow(
      /status/i,
    );
  });
});

describe("getSpecIndex (AC-6)", () => {
  // Derived dynamically from the real docs/specs/ directory at test time,
  // not a hardcoded "exactly specs 001-00N exist" / "spec 003 has no PR"
  // assumption — so this suite doesn't break the moment a new spec is
  // added, or spec 003 itself is later retrofitted with its own PR: line.
  const realSpecFilenames = readdirSync(specsDir).filter((filename) =>
    /^\d{3}-[\w-]+\.md$/.test(filename),
  );

  it("returns exactly one entry per real spec file in docs/specs/", () => {
    const index = getSpecIndex();
    expect(index).toHaveLength(realSpecFilenames.length);
  });

  it("excludes non-spec files (*.plan.md, *.log.md, _TEMPLATE.md)", () => {
    const index = getSpecIndex();
    const numbers = index.map((entry) => entry.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("sorts entries ascending by number", () => {
    const index = getSpecIndex();
    const numbers = index.map((entry) => entry.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it("matches every real spec file's own header and PR line", () => {
    const index = getSpecIndex();
    for (const filename of realSpecFilenames) {
      const raw = readSpecFileRaw(filename);
      const expected = parseSpecIndexEntry(raw, filename);
      const actual = index.find((entry) => entry.number === expected.number);
      expect(actual).toEqual(expected);
    }
  });
});
