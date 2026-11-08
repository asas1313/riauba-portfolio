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

  it("strips a trailing slash from the path so it matches the non-trailing-slash canonical URL", () => {
    const withTrailingSlash = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "/projects/",
    });
    const withoutTrailingSlash = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "/projects",
    });
    // Trailing and non-trailing variants of the same path are normalised to
    // a single canonical form, so the same route never produces two
    // different canonical URLs.
    expect(withTrailingSlash.canonical).toBe("https://riauba.org/projects");
    expect(withTrailingSlash.canonical).toBe(withoutTrailingSlash.canonical);
  });

  it("does not strip the trailing slash from the root path", () => {
    const seo = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "/",
    });
    expect(seo.canonical).toBe("https://riauba.org/");
  });

  it("resolves an empty path to the site root", () => {
    const seo = buildPageSeo(site, { title: "t", description: "d", path: "" });
    expect(seo.canonical).toBe("https://riauba.org/");
  });

  it("still produces a riauba.org canonical URL when the site URL itself has no trailing slash", () => {
    const siteNoTrailingSlash = new URL("https://riauba.org");
    const seo = buildPageSeo(siteNoTrailingSlash, {
      title: "t",
      description: "d",
      path: "/404",
    });
    expect(seo.canonical).toBe("https://riauba.org/404");
  });

  it("fix: a protocol-relative path can no longer escape riauba.org, preserving the AC-8 'always on https://riauba.org' guarantee", () => {
    const seo = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "//evil.example.com/phish",
    });
    // A leading "//" is collapsed to a single "/" before resolution, so the
    // path is always treated as same-origin, never as protocol-relative to
    // a different host.
    expect(seo.canonical.startsWith("https://riauba.org")).toBe(true);
    expect(seo.canonical).toBe("https://riauba.org/evil.example.com/phish");
  });

  it("fix: a fully-qualified absolute https:// foreign URL as path cannot escape riauba.org", () => {
    const seo = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "https://evil.example.com/phish",
    });
    // The scheme and host of a fully-qualified absolute URL passed as `path`
    // must be discarded; only the pathname is kept and resolved against
    // `site`, so the canonical/OG URL always stays on riauba.org.
    expect(seo.canonical.startsWith("https://riauba.org")).toBe(true);
    expect(seo.canonical).toBe("https://riauba.org/phish");
    expect(seo.og.url).toBe("https://riauba.org/phish");
  });

  it("fix: a fully-qualified absolute http:// foreign URL as path cannot escape riauba.org", () => {
    const seo = buildPageSeo(site, {
      title: "t",
      description: "d",
      path: "http://evil.example.com/phish",
    });
    expect(seo.canonical.startsWith("https://riauba.org")).toBe(true);
    expect(seo.canonical).toBe("https://riauba.org/phish");
    expect(seo.og.url).toBe("https://riauba.org/phish");
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
