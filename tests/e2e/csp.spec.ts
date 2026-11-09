import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Spec 004, AC-6/task 6: no automated test can exercise Caddy itself (it
// never runs in CI/local dev -- only on the homelab), but we can still
// prove the *real* CSP header value, parsed straight out of
// infra/Caddyfile (never hand-copied, so it can't drift), doesn't break
// the actual pages when a browser enforces it. `astro preview`'s plain
// HTTP responses carry no CSP header at all; this test re-applies
// infra/Caddyfile's exact header via Playwright route interception and
// listens for the console messages a real CSP violation would produce.
const caddyfilePath = fileURLToPath(
  new URL("../../infra/Caddyfile", import.meta.url),
);

function extractCspHeaderValue(): string {
  const text = readFileSync(caddyfilePath, "utf-8");
  const match = text.match(/Content-Security-Policy\s+"([^"]+)"/);
  if (!match) {
    throw new Error(
      "csp.spec: no Content-Security-Policy line found in infra/Caddyfile",
    );
  }
  return match[1];
}

const cspHeaderValue = extractCspHeaderValue();
const CSP_VIOLATION_PATTERN = /content security policy|csp/i;
const paths = ["/", "/cv", "/projects"];

for (const path of paths) {
  test(`${path} causes no CSP-violation console message under infra/Caddyfile's real CSP header`, async ({
    page,
  }) => {
    await page.route("**/*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "content-security-policy": cspHeaderValue,
        },
      });
    });

    const violations: string[] = [];
    page.on("console", (message) => {
      if (CSP_VIOLATION_PATTERN.test(message.text())) {
        violations.push(message.text());
      }
    });

    await page.goto(path);
    await page.waitForLoadState("networkidle");

    expect(violations).toEqual([]);
  });
}
