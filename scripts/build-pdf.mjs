#!/usr/bin/env node
// Prints /cv/print to dist/andrius-riauba-cv.pdf using a headless Chromium
// driven by playwright-core (spec 002, AC-4; see ADR-0002).
//
// `astro build` only produces static files in dist/ — nothing serves them —
// so this script spawns the project's own `npm run preview` on a dedicated
// port (4323, distinct from the e2e suite's 4321) to serve dist/, polls it
// with `fetch` until it responds, prints the page, and always tears the
// preview server and browser down in a `finally` block, failing loudly
// (non-zero exit, thrown error) rather than hanging or leaking a process on
// any step's failure.
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 4323;
const BASE_URL = `http://localhost:${PORT}`;
const PRINT_URL = `${BASE_URL}/cv/print`;
const OUTPUT_PATH = "dist/andrius-riauba-cv.pdf";
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_INTERVAL_MS = 250;
const SHUTDOWN_TIMEOUT_MS = 5_000;

function startPreviewServer() {
  // `detached: true` makes this child the leader of its own process group,
  // so `stopPreviewServer` can reliably signal the whole group (`npm` *and*
  // whatever it execs/forks into, e.g. the actual `astro preview` process)
  // instead of just the immediate child, which some npm versions replace
  // via exec() rather than keeping around as a distinct, waitable PID.
  return spawn("npm", ["run", "preview", "--", "--port", String(PORT)], {
    stdio: "inherit",
    detached: true,
  });
}

async function waitUntilReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server socket not listening yet; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
  }
  throw new Error(
    `build-pdf: preview server at "${url}" did not become ready within ${timeoutMs}ms`,
  );
}

function killProcessGroup(pid, signal) {
  try {
    // Negative pid signals the whole process group (see `detached: true`
    // in startPreviewServer).
    process.kill(-pid, signal);
  } catch {
    // Already gone (ESRCH) or never had permission; either way there is
    // nothing left to signal.
  }
}

function stopPreviewServer(server, timeoutMs) {
  return new Promise((resolve) => {
    if (server.exitCode !== null || server.killed) {
      resolve();
      return;
    }
    const pid = server.pid;
    const timer = setTimeout(() => {
      killProcessGroup(pid, "SIGKILL");
      resolve();
    }, timeoutMs);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    killProcessGroup(pid, "SIGTERM");
  });
}

async function main() {
  const server = startPreviewServer();
  let browser;
  try {
    await waitUntilReady(BASE_URL, READY_TIMEOUT_MS);

    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(PRINT_URL, { waitUntil: "networkidle" });
    // Runs inside the browser page, not this Node script, so `document` is
    // not a Node global here (hence the lint override).
    // eslint-disable-next-line no-undef
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: OUTPUT_PATH,
      format: "A4",
      printBackground: true,
    });
    console.log(`build-pdf: wrote ${OUTPUT_PATH}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopPreviewServer(server, SHUTDOWN_TIMEOUT_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
