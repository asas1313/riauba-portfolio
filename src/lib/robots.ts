/**
 * Builds the content of `/robots.txt` (spec 004, AC-7).
 *
 * `noindex` mirrors the `NOINDEX` build flag (`import.meta.env.NOINDEX ===
 * "true"`, set per environment by the deploy workflows): staging always
 * builds with it true; production builds with it true until
 * `PROD_NOINDEX=false` is set per the runbook's "Switch to riauba.org"
 * checklist. The same flag also drives the `dist/.noindex` sentinel file
 * (see astro.config.mjs's `astro:build:done` hook) that infra/Caddyfile
 * uses to set the `X-Robots-Tag` header — so this file and that header can
 * never disagree within one deployed release.
 */
export function buildRobotsTxt(noindex: boolean): string {
  return noindex ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n";
}
