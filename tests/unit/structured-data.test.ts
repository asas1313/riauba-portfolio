import { describe, expect, it } from "vitest";
import {
  buildPersonJsonLd,
  toSafeJsonLd,
} from "../../src/lib/structured-data.ts";
import type { Cv } from "../../src/lib/cv.schema.ts";

function cvFixture(overrides: Partial<Cv["basics"]> = {}): Cv {
  return {
    basics: {
      name: "Andrius Riauba",
      label: "Senior Java Developer",
      email: "andrius@riauba.org",
      url: "https://riauba.org",
      location: { city: "Vilnius", countryCode: "LT" },
      remote: "Open to remote roles",
      profiles: [
        { network: "LinkedIn", url: "https://www.linkedin.com/in/andrius-r" },
        { network: "GitHub", url: "https://github.com/asas1313" },
      ],
      summary: "Summary.",
      ...overrides,
    },
    work: [],
    skills: [],
    education: [],
    languages: [],
    certificates: [],
  };
}

describe("buildPersonJsonLd", () => {
  it("maps basics onto a schema.org Person", () => {
    const jsonLd = buildPersonJsonLd(cvFixture());
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Person");
    expect(jsonLd.name).toBe("Andrius Riauba");
    expect(jsonLd.jobTitle).toBe("Senior Java Developer");
    expect(jsonLd.email).toBe("andrius@riauba.org");
    expect(jsonLd.url).toBe("https://riauba.org");
    expect(jsonLd.description).toBe("Summary.");
  });

  it("maps location onto a PostalAddress", () => {
    const jsonLd = buildPersonJsonLd(cvFixture());
    expect(jsonLd.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Vilnius",
      addressCountry: "LT",
    });
  });

  it("maps every profile URL onto sameAs, in order", () => {
    const jsonLd = buildPersonJsonLd(cvFixture());
    expect(jsonLd.sameAs).toEqual([
      "https://www.linkedin.com/in/andrius-r",
      "https://github.com/asas1313",
    ]);
  });

  it("returns an empty sameAs array when there are no profiles (boundary)", () => {
    const jsonLd = buildPersonJsonLd(cvFixture({ profiles: [] }));
    expect(jsonLd.sameAs).toEqual([]);
  });
});

describe("toSafeJsonLd", () => {
  it("escapes a literal < as \\u003c so </script> cannot be smuggled in", () => {
    const serialized = toSafeJsonLd({ description: "a <script> tag" });
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003cscript>");
  });

  it("round-trips back to the original value via JSON.parse", () => {
    const value = { a: 1, b: "<b>", c: ["<x>"] };
    const parsed = JSON.parse(toSafeJsonLd(value));
    expect(parsed).toEqual(value);
  });

  it("produces valid JSON for a real buildPersonJsonLd fixture containing a < in summary", () => {
    const cv = cvFixture({ summary: "Worked on <script>alert(1)</script>." });
    const jsonLd = buildPersonJsonLd(cv);
    const serialized = toSafeJsonLd(jsonLd);
    expect(serialized).not.toContain("<script>");
    expect(serialized).toContain("\\u003cscript>");
    expect(JSON.parse(serialized).description).toBe(
      "Worked on <script>alert(1)</script>.",
    );
  });
});
