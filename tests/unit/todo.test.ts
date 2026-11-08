import { describe, expect, it } from "vitest";
import { TODO_PATTERN, isTodoMarked } from "../../src/lib/todo.ts";

describe("TODO_PATTERN", () => {
  it("matches the whole word TODO", () => {
    expect(TODO_PATTERN.test("TODO")).toBe(true);
    expect(TODO_PATTERN.test("TODO: ask about dates")).toBe(true);
  });

  it("does not match a lowercase todo or a substring like Kristodoras", () => {
    expect(TODO_PATTERN.test("todo")).toBe(false);
    expect(TODO_PATTERN.test("Kristodoras")).toBe(false);
  });
});

describe("isTodoMarked", () => {
  it("returns true for a whole-word TODO value", () => {
    expect(isTodoMarked("TODO")).toBe(true);
    expect(isTodoMarked("TODO: fill this in")).toBe(true);
  });

  it("returns false for null, undefined and non-matching strings", () => {
    expect(isTodoMarked(null)).toBe(false);
    expect(isTodoMarked(undefined)).toBe(false);
    expect(isTodoMarked("https://example.com")).toBe(false);
    expect(isTodoMarked("Kristodoras")).toBe(false);
    expect(isTodoMarked("todo")).toBe(false);
  });
});
