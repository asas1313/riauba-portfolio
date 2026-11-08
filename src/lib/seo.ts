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
 * A path with a leading "//" (e.g. "//evil.example.com/x") is normally
 * treated by WHATWG URL resolution as protocol-relative, resolving onto a
 * different host entirely. We collapse any leading run of slashes to a
 * single one so such a path is always treated as a same-origin absolute
 * path instead.
 *
 * Trailing slashes are stripped (except for the root "/") so that
 * "/projects" and "/projects/" resolve to the same canonical URL.
 */
function resolveCanonicalUrl(site: URL, path: string): string {
  const safePath = path.replace(/^\/+/, "/");
  const url = new URL(safePath, site);
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
