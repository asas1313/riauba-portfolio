import type { APIRoute } from "astro";
import { buildRobotsTxt } from "../lib/robots.ts";

// Spec 004, AC-7. `NOINDEX` is set per environment by the deploy workflows
// (staging: always "true"; production: `PROD_NOINDEX`, default "true"
// until the "Switch to riauba.org" checklist flips it to "false"). Local
// `make build`/`make e2e` never set it, so `robots.txt` defaults to
// allowing everything, matching today's (pre-spec-004) behaviour.
export const GET: APIRoute = () => {
  const noindex = import.meta.env.NOINDEX === "true";
  return new Response(buildRobotsTxt(noindex), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
