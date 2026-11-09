/**
 * Resolves the absolute site origin Astro should build against, from the
 * `SITE_URL` environment variable (spec 004, AC-1).
 *
 * - For `command === "build"`, `SITE_URL` is required: missing or
 *   configured-but-empty (including whitespace-only) both throw a
 *   descriptive error, failing the build loudly rather than silently
 *   falling back to a wrong origin. This also covers a GitHub Environment
 *   variable that exists but was left empty — see astro.config.mjs's and
 *   the Makefile's use of `${SITE_URL-default}` (no colon) for why an
 *   empty-but-set value must reach here as `""`, not be substituted away
 *   before this function ever runs.
 * - For every other Astro command (`dev`, `preview`, `check`, `sync`, ...),
 *   an unset/empty `SITE_URL` falls back to `http://localhost:4321` so
 *   local development keeps working without it; an explicit `SITE_URL` is
 *   still honoured if present.
 */
export function resolveSiteUrl(
  env: Record<string, string | undefined>,
  command: string,
): string {
  const trimmed = env.SITE_URL?.trim() ?? "";

  if (trimmed !== "") {
    return trimmed;
  }

  if (command === "build") {
    throw new Error(
      "SITE_URL environment variable is required for `astro build` " +
        "(spec 004, AC-1) but is missing or empty. Set it to the " +
        "absolute origin for this environment, e.g. " +
        "SITE_URL=https://riauba.org.",
    );
  }

  return "http://localhost:4321";
}
