import { describe, expect, it } from "vitest";
import { buildPageSeo } from "../../src/lib/seo.ts";

const site = new URL("https://riauba.org/");

describe("buildPageSeo", () => {
  it("builds a canonical URL for the home path", () => {
    const seo = buildPageSeo(site, {
      title: "Home",
      description: "desc",
      path: "/",
    });
    expect(seo.canonical).toBe("https://riauba.org/");
  });

  it("builds a canonical URL for a nested path without a double slash", () => {
    const seo = buildPageSeo(site, {
      title: "404",
      description: "desc",
      path: "/404",
    });
    expect(seo.canonical).toBe("https://riauba.org/404");
  });

  it("joins a path without a leading slash the same way as with one", () => {
    const withSlash = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "/projects",
    });
    const withoutSlash = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "projects",
    });
    expect(withSlash.canonical).toBe(withoutSlash.canonical);
  });

  it("always produces a canonical URL on https://riauba.org", () => {
    const seo = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "/anything",
    });
    expect(seo.canonical.startsWith("https://riauba.org")).toBe(true);
  });

  it("passes title and description through unchanged", () => {
    const seo = buildPageSeo(site, {
      title: "My title",
      description: "My description",
      path: "/",
    });
    expect(seo.title).toBe("My title");
    expect(seo.description).toBe("My description");
  });

  it("builds matching Open Graph tags", () => {
    const seo = buildPageSeo(site, {
      title: "My title",
      description: "My description",
      path: "/",
    });
    expect(seo.og).toEqual({
      title: "My title",
      description: "My description",
      type: "website",
      url: "https://riauba.org/",
    });
  });
});
