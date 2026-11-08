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
});
