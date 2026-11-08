import { describe, expect, it } from "vitest";
import { getWorkReverseChronological } from "../../src/lib/cv.ts";
import type { Work } from "../../src/lib/cv.schema.ts";

function entry(overrides: Partial<Work>): Work {
  return {
    name: "Company",
    position: "Engineer",
    startDate: "2020-01",
    summary: "Summary.",
    highlights: [],
    ...overrides,
  };
}

describe("getWorkReverseChronological", () => {
  it("sorts a shuffled list by endDate descending", () => {
    const shuffled: Work[] = [
      entry({ name: "Oldest", startDate: "2010-01", endDate: "2012-01" }),
      entry({ name: "Newest", startDate: "2022-01", endDate: "2023-01" }),
      entry({ name: "Middle", startDate: "2015-01", endDate: "2018-01" }),
    ];
    const sorted = getWorkReverseChronological(shuffled);
    expect(sorted.map((w) => w.name)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("sorts an ongoing entry (no endDate) first, ahead of entries with a real endDate", () => {
    const work: Work[] = [
      entry({ name: "Past role", startDate: "2022-01", endDate: "2024-01" }),
      entry({ name: "Current role", startDate: "2024-02", endDate: undefined }),
    ];
    const sorted = getWorkReverseChronological(work);
    expect(sorted.map((w) => w.name)).toEqual(["Current role", "Past role"]);
  });

  it("breaks a tie on identical endDate by startDate descending", () => {
    const work: Work[] = [
      entry({
        name: "Earlier start",
        startDate: "2020-01",
        endDate: "2021-01",
      }),
      entry({
        name: "Later start",
        startDate: "2020-06",
        endDate: "2021-01",
      }),
    ];
    const sorted = getWorkReverseChronological(work);
    expect(sorted.map((w) => w.name)).toEqual(["Later start", "Earlier start"]);
  });

  it("does not mutate the input array", () => {
    const work: Work[] = [
      entry({ name: "A", startDate: "2020-01", endDate: "2021-01" }),
      entry({ name: "B", startDate: "2022-01", endDate: "2023-01" }),
    ];
    const original = [...work];
    getWorkReverseChronological(work);
    expect(work).toEqual(original);
  });

  it("returns an empty array when given no work entries (boundary)", () => {
    expect(getWorkReverseChronological([])).toEqual([]);
  });
});
