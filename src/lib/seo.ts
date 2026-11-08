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
 * Builds the canonical URL (resolved against the Astro site URL) and Open
 * Graph tag values for a page (AC-8).
 */
export function buildPageSeo(site: URL, input: PageSeoInput): PageSeo {
  const canonical = new URL(input.path, site).toString();
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
