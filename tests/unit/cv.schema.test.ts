import { describe, expect, it } from "vitest";
import { parseCv } from "../../src/lib/cv.schema.ts";

function validCvFixture() {
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
      ],
      summary: "Summary.",
    },
    work: [],
    skills: [],
    education: [],
    languages: [],
    certificates: [],
  };
}

describe("parseCv", () => {
  it("accepts a valid CV document", () => {
    expect(() => parseCv(validCvFixture())).not.toThrow();
  });

  it("throws a readable error naming the field path when basics.name is missing", () => {
    const fixture = validCvFixture();
    // @ts-expect-error -- intentionally invalid fixture for AC-3
    delete fixture.basics.name;

    expect(() => parseCv(fixture)).toThrow(/basics\.name/);
  });

  it("throws a readable error naming the field path for a deeply nested field", () => {
    const fixture = validCvFixture();
    // @ts-expect-error -- intentionally invalid fixture for AC-3
    delete fixture.basics.location.city;

    expect(() => parseCv(fixture)).toThrow(/basics\.location\.city/);
  });

  it("throws a readable error when basics.profiles is the wrong type (not an array)", () => {
    const fixture = validCvFixture();
    // @ts-expect-error -- intentionally invalid fixture for AC-3
    fixture.basics.profiles = "https://www.linkedin.com/in/andrius-r";

    expect(() => parseCv(fixture)).toThrow(/basics\.profiles/);
  });

  it("throws a readable error naming the field path when basics.email is missing", () => {
    const fixture = validCvFixture();
    // @ts-expect-error -- intentionally invalid fixture for AC-3
    delete fixture.basics.email;

    expect(() => parseCv(fixture)).toThrow(/basics\.email/);
  });

  it("throws a readable error naming an element path when a work entry's highlights is not an array of strings", () => {
    const fixture: Record<string, unknown> = validCvFixture();
    fixture.work = [
      {
        name: "Acme",
        position: "Engineer",
        startDate: "2020-01",
        summary: "Summary.",
        highlights: "Did things",
      },
    ];

    expect(() => parseCv(fixture)).toThrow(/work\.0\.highlights/);
  });

  it("lists every failing field, not just the first, when several fields are invalid at once", () => {
    const fixture = validCvFixture();
    // @ts-expect-error -- intentionally invalid fixture for AC-3
    delete fixture.basics.name;
    // @ts-expect-error -- intentionally invalid fixture for AC-3
    delete fixture.basics.email;

    let message = "";
    try {
      parseCv(fixture);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/basics\.name/);
    expect(message).toMatch(/basics\.email/);
  });

  it("throws naming the root-level missing key when a whole top-level section is absent", () => {
    const fixture = validCvFixture();
    // @ts-expect-error -- intentionally invalid fixture for AC-3
    delete fixture.work;

    expect(() => parseCv(fixture)).toThrow(/work/);
  });

  it("rejects an entirely empty document with a readable error rather than a generic crash", () => {
    expect(() => parseCv({})).toThrow(/Invalid content\/cv\.yaml/);
  });

  it("accepts a CV with zero profiles (empty basics.profiles array is a valid boundary, not an error)", () => {
    const fixture = validCvFixture();
    fixture.basics.profiles = [];

    expect(() => parseCv(fixture)).not.toThrow();
    expect(parseCv(fixture).basics.profiles).toEqual([]);
  });
});
