import { describe, expect, it, vi } from "vitest";
import {
  findTodoFields,
  getPublishableCv,
  stripTodoFields,
} from "../../src/lib/cv.publish.ts";
import type { Cv } from "../../src/lib/cv.schema.ts";

function baseCvFixture(): Cv {
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
    },
    work: [
      {
        name: "Acme",
        position: "Engineer",
        startDate: "2020-01",
        endDate: "2021-01",
        url: "https://acme.example.com",
        summary: "Did work.",
        highlights: ["Shipped feature A", "Shipped feature B"],
      },
    ],
    skills: [{ name: "Backend", keywords: ["Java", "Spring Boot"] }],
    education: [],
    languages: [],
    certificates: [],
  };
}

describe("findTodoFields", () => {
  it("returns an empty array when nothing matches", () => {
    expect(findTodoFields(baseCvFixture())).toEqual([]);
  });

  it("finds a whole-word TODO leaf and reports its dot-path", () => {
    const fixture = baseCvFixture();
    fixture.work[0].endDate = "TODO";
    expect(findTodoFields(fixture)).toEqual(["work.0.endDate"]);
  });

  it("does not match a substring that merely contains the letters TODO", () => {
    const fixture = baseCvFixture();
    fixture.basics.profiles.push({
      network: "Kristodoras",
      url: "https://example.com/kristodoras",
    });
    expect(findTodoFields(fixture)).toEqual([]);
  });

  it("does not match a lowercase 'todo' (case-sensitive match only)", () => {
    const fixture = baseCvFixture();
    fixture.work[0].summary = "todo: ask about dates";
    expect(findTodoFields(fixture)).toEqual([]);
  });

  it("matches a whole-word TODO embedded in a longer sentence", () => {
    const fixture = baseCvFixture();
    fixture.work[0].summary = "TODO: ask about dates";
    expect(findTodoFields(fixture)).toEqual(["work.0.summary"]);
  });
});

describe("stripTodoFields", () => {
  it("drops the entire profile object when a required field (network) is TODO", () => {
    const fixture = baseCvFixture();
    fixture.basics.profiles.push({ network: "TODO", url: "https://x.example" });
    const { cv, strippedPaths } = stripTodoFields(fixture);
    expect(cv.basics.profiles).toEqual([
      { network: "LinkedIn", url: "https://www.linkedin.com/in/andrius-r" },
      { network: "GitHub", url: "https://github.com/asas1313" },
    ]);
    expect(strippedPaths).toEqual(["basics.profiles.2.network"]);
  });

  it("drops the entire profile object when a required field (url) is TODO", () => {
    const fixture = baseCvFixture();
    fixture.basics.profiles.push({ network: "Mastodon", url: "TODO" });
    const { cv } = stripTodoFields(fixture);
    expect(cv.basics.profiles.map((p) => p.network)).toEqual([
      "LinkedIn",
      "GitHub",
    ]);
  });

  it("drops only the optional field (endDate) when it is TODO, keeping the rest of the work entry", () => {
    const fixture = baseCvFixture();
    fixture.work[0].endDate = "TODO";
    const { cv } = stripTodoFields(fixture);
    expect(cv.work).toHaveLength(1);
    expect(cv.work[0].endDate).toBeUndefined();
    expect(cv.work[0].name).toBe("Acme");
  });

  it("drops only the optional field (url) when it is TODO, keeping the rest of the work entry", () => {
    const fixture = baseCvFixture();
    fixture.work[0].url = "TODO";
    const { cv } = stripTodoFields(fixture);
    expect(cv.work).toHaveLength(1);
    expect(cv.work[0].url).toBeUndefined();
    expect(cv.work[0].name).toBe("Acme");
  });

  it("drops the whole work entry when a required field (name) is TODO", () => {
    const fixture = baseCvFixture();
    fixture.work.push({
      name: "TODO",
      position: "Engineer",
      startDate: "2022-01",
      summary: "Did work.",
      highlights: [],
    });
    const { cv } = stripTodoFields(fixture);
    expect(cv.work).toHaveLength(1);
    expect(cv.work[0].name).toBe("Acme");
  });

  it("drops the whole work entry when a required field (position) is TODO", () => {
    const fixture = baseCvFixture();
    fixture.work.push({
      name: "Other Co",
      position: "TODO",
      startDate: "2022-01",
      summary: "Did work.",
      highlights: [],
    });
    const { cv } = stripTodoFields(fixture);
    expect(cv.work.map((w) => w.name)).toEqual(["Acme"]);
  });

  it("drops only a single TODO element from a plain string array (highlights), keeping its siblings", () => {
    const fixture = baseCvFixture();
    fixture.work[0].highlights = [
      "Shipped feature A",
      "TODO",
      "Shipped feature B",
    ];
    const { cv } = stripTodoFields(fixture);
    expect(cv.work[0].highlights).toEqual([
      "Shipped feature A",
      "Shipped feature B",
    ]);
  });

  it("drops only a single TODO element from a plain string array (keywords), keeping its siblings", () => {
    const fixture = baseCvFixture();
    fixture.skills[0].keywords = ["Java", "TODO", "Spring Boot"];
    const { cv } = stripTodoFields(fixture);
    expect(cv.skills[0].keywords).toEqual(["Java", "Spring Boot"]);
  });

  it("returns every stripped path, one per TODO match", () => {
    const fixture = baseCvFixture();
    fixture.work[0].endDate = "TODO";
    fixture.work[0].highlights.push("TODO");
    const { strippedPaths } = stripTodoFields(fixture);
    expect(strippedPaths.sort()).toEqual(
      ["work.0.endDate", "work.0.highlights.2"].sort(),
    );
  });

  it("does not mutate the input CV (deep clones before stripping)", () => {
    const fixture = baseCvFixture();
    fixture.work[0].endDate = "TODO";
    stripTodoFields(fixture);
    expect(fixture.work[0].endDate).toBe("TODO");
  });

  it("returns an unchanged clone and no stripped paths when nothing matches", () => {
    const fixture = baseCvFixture();
    const { cv, strippedPaths } = stripTodoFields(fixture);
    expect(cv).toEqual(fixture);
    expect(strippedPaths).toEqual([]);
  });
});

describe("getPublishableCv", () => {
  it("returns the CV unchanged in dev mode, even when TODO fields are present", () => {
    const fixture = baseCvFixture();
    fixture.work[0].endDate = "TODO";
    const warn = vi.fn();
    const result = getPublishableCv(fixture, { isProd: false, warn });
    expect(result).toBe(fixture);
    expect(result.work[0].endDate).toBe("TODO");
    expect(warn).not.toHaveBeenCalled();
  });

  it("strips TODO fields in prod mode and warns with every stripped path", () => {
    const fixture = baseCvFixture();
    fixture.work[0].endDate = "TODO";
    fixture.basics.profiles.push({ network: "TODO", url: "https://x.example" });
    const warn = vi.fn();
    const result = getPublishableCv(fixture, { isProd: true, warn });
    expect(result.work[0].endDate).toBeUndefined();
    expect(result.basics.profiles).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain("work.0.endDate");
    expect(message).toContain("basics.profiles.2.network");
  });

  it("does not warn in prod mode when there is nothing to strip", () => {
    const fixture = baseCvFixture();
    const warn = vi.fn();
    getPublishableCv(fixture, { isProd: true, warn });
    expect(warn).not.toHaveBeenCalled();
  });
});
