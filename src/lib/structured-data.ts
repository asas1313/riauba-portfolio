import type { Cv } from "./cv.schema.ts";

export interface PersonJsonLd {
  "@context": "https://schema.org";
  "@type": "Person";
  name: string;
  jobTitle: string;
  email: string;
  url: string;
  address: {
    "@type": "PostalAddress";
    addressLocality: string;
    addressCountry: string;
  };
  sameAs: string[];
  description: string;
}

/**
 * Maps `cv.basics` onto a schema.org `Person` (AC-6). The caller is
 * responsible for passing an already-publishable CV (`cvForBuild`) so
 * `sameAs` only ever contains visible profile URLs — this function trusts
 * whatever profiles it is given, keeping TODO-filtering a single concern
 * (spec 002, decision #3).
 */
export function buildPersonJsonLd(cv: Cv): PersonJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: cv.basics.name,
    jobTitle: cv.basics.label,
    email: cv.basics.email,
    url: cv.basics.url,
    address: {
      "@type": "PostalAddress",
      addressLocality: cv.basics.location.city,
      addressCountry: cv.basics.location.countryCode,
    },
    sameAs: cv.basics.profiles.map((profile) => profile.url),
    description: cv.basics.summary,
  };
}

/**
 * Serializes `value` to JSON for injection into a `<script
 * type="application/ld+json">` via `set:html`, escaping every literal "<"
 * as "<" so no CV field (e.g. a summary mentioning "<script>") can
 * prematurely close the surrounding script tag (spec 002, decision #5).
 */
export function toSafeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
