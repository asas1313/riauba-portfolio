export interface PageSeoInput {
  title: string;
  description: string;
  /** Page path, e.g. "/" or "/404". Leading slash is optional. */
  path: string;
}

export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  og: {
    title: string;
    description: string;
    type: "website";
    url: string;
  };
}

/**
 * Resolves `path` against `site` into a canonical URL, guaranteeing the
 * result always stays on `site`'s origin and is normalised to a single
 * trailing-slash convention.
 *
 * `path` is always treated as same-origin, never as a pointer to another
 * host, regardless of what it looks like:
 *
 * - A path with a leading "//" (e.g. "//evil.example.com/x") is normally
 *   treated by WHATWG URL resolution as protocol-relative, resolving onto a
 *   different host entirely. We collapse any leading run of slashes to a
 *   single one so such a path is always treated as a same-origin absolute
 *   path instead.
 * - A fully-qualified absolute URL (e.g. "https://evil.example.com/x") has
 *   its scheme and host discarded up front, keeping only the
 *   pathname/search/hash, so it can never resolve onto a foreign origin
 *   either.
 * - As a last-resort guarantee, if the resolved URL's origin ever still
 *   diverges from `site`'s origin, we throw rather than silently return an
 *   off-site URL (fail loudly instead of leaking a foreign canonical/OG URL).
 *
 * Trailing slashes are stripped (except for the root "/") so that
 * "/projects" and "/projects/" resolve to the same canonical URL.
 */
function resolveCanonicalUrl(site: URL, path: string): string {
  let normalizedPath = path;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalizedPath)) {
    const absolute = new URL(normalizedPath);
    normalizedPath = `${absolute.pathname}${absolute.search}${absolute.hash}`;
  }
  const safePath = normalizedPath.replace(/^\/+/, "/");
  const url = new URL(safePath, site);
  if (url.origin !== site.origin) {
    throw new Error(
      `resolveCanonicalUrl: resolved URL "${url.toString()}" escaped site origin "${site.origin}"`,
    );
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

/**
 * Builds the canonical URL (resolved against the Astro site URL) and Open
 * Graph tag values for a page (AC-8).
 */
export function buildPageSeo(site: URL, input: PageSeoInput): PageSeo {
  const canonical = resolveCanonicalUrl(site, input.path);
  return {
    title: input.title,
    description: input.description,
    canonical,
    og: {
      title: input.title,
      description: input.description,
      type: "website",
      url: canonical,
    },
  };
}
