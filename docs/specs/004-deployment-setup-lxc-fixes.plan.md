# 004 – `infra/setup-lxc.sh` fixes (follow-up to homelab deployment): implementation plan

Spec: [docs/specs/004-deployment.md](./004-deployment.md), `## Added requirements` section (written
by Andrius after running `infra/setup-lxc.sh` against the real homelab LXC and hitting an unclear
error). Context read for this plan: [docs/specs/004-deployment.plan.md](./004-deployment.plan.md),
[docs/specs/004-deployment.log.md](./004-deployment.log.md), `infra/setup-lxc.sh`, `infra/deploy.sh`,
`infra/rollback.sh`, `infra/Caddyfile`, `.github/workflows/ci.yml`, `docs/technical/runbook.md`.

Status: **Approved by Andrius (2026-11-09)**. See "Resolved decisions" at the end of this document
(replaces the "Open questions" section below, which is kept for historical context).

## Summary

`infra/Caddyfile` addresses its two site blocks with `{$PROD_HOSTS}`/`{$STAGING_HOSTS}` —
confirmed, by reading the file, to be the *only* two `{$VAR}` references it makes — but a systemd
service only ever sees environment variables that are wired into its own unit (via
`EnvironmentFile=` or a drop-in), never whatever shell happened to run `infra/setup-lxc.sh`.
Today's script installs the Caddyfile and reloads Caddy without ever setting up that systemd-level
environment, so a real run either reloads successfully into a config that silently matches no
hostnames, or Caddy refuses to start — either way with no clear error pointing at the real cause.
This plan fixes `infra/setup-lxc.sh` to (1) resolve the Caddyfile's required variables from two
checked-in, per-environment files (`infra/production.env`/`infra/staging.env` — Andrius' explicit
choice, see Resolved decisions), and abort with a specific, named-variable error *before* doing any
install work if either is missing or incomplete; (2) validate the
Caddyfile with `caddy validate` — using those same resolved variables exported into that validation
shell — before ever reloading or restarting the live Caddy service; and (3) generate and own a
single, documented systemd `EnvironmentFile` plus the drop-in that wires it into Caddy's unit, so
steps 1–2 above are self-sufficient and the manual step `docs/technical/runbook.md` currently
describes (telling Andrius to edit `/etc/default/caddy` or the unit's `Environment=` by hand) is
removed. The whole script remains safe to run twice, unchanged from spec 004's AC-10. No new
dependency, external service or data model is introduced, so no new ADR is drafted; this is an
operational bug fix within the architecture ADR-0005 already accepted.

## Acceptance criteria → tests

| AC | Criterion (from the "Added requirements" text) | Tests |
| --- | --- | --- |
| AC-1 | Before any install step runs, `infra/setup-lxc.sh` resolves every variable `infra/Caddyfile` references via `{$VAR}` (discovered dynamically, not hardcoded) by reading it from its mapped checked-in file (`infra/production.env`/`infra/staging.env`), and — if either file is missing or doesn't define its expected variable — exits non-zero with a message naming exactly which file/variable is missing, without creating the `deploy` user, touching `/srv/riauba`, or installing Caddy. | **New** `tests/unit/infra-setup-lxc.test.ts`: spawns the real script (as the sandbox's non-root test user, same `node:child_process` pattern as `infra-deploy.test.ts`/`infra-rollback.test.ts`) against a scratch copy of the script's directory with `production.env`/`staging.env` missing or incomplete, asserts (a) non-zero exit, (b) stderr names the missing file/variable, and (c) stderr is the variable-check's own message, not the later "must be run as root" message — proving the check runs first and before any install action, not merely before the final `caddy validate`/reload. A second case supplies both files correctly and asserts the script instead fails with the "must be run as root" message — proving valid input reaches the next gate rather than being rejected. Everything past the root check (actual `useradd`, directory creation, Caddy install, env-file/drop-in writing, `caddy validate`, reload/restart) stays manual-only, same boundary spec 004 already accepted for this script (see Risks). |
| AC-2 | Before `systemctl reload`/`restart caddy`, the script runs `caddy validate --config` against the Caddyfile with the resolved variables exported into that same validation shell, and aborts (non-zero exit, clear message, Caddy's live config/service untouched) if validation fails. | Manual-only (needs a real `caddy` binary and a real systemd service; `caddy validate` already can't run in this repo's Vitest/CI the same way `infra/deploy.sh`/`infra/rollback.sh` can, since there's no real Caddy process to validate against locally). Covered by: (a) the existing CI step in `.github/workflows/ci.yml` ("Validate infra/Caddyfile" against the `caddy:2` Docker image) continuing to pass with representative `PROD_HOSTS`/`STAGING_HOSTS` values — proves the Caddyfile itself stays valid Caddy syntax; (b) a manual runbook verification step (new, task 9) where Andrius deliberately breaks the Caddyfile locally, re-runs `infra/setup-lxc.sh`, and confirms it reports the validate failure and leaves the running Caddy process untouched, before reverting the breakage and confirming a clean re-run reloads normally. |
| AC-3 | The script itself creates a systemd `EnvironmentFile` (`/etc/caddy/env`) and the drop-in that wires it into Caddy's unit, merging the values read from `infra/production.env`/`infra/staging.env` — so this is no longer a manual step, and the variables live in one file that is documented both in the script's own header comment and in `docs/technical/runbook.md`. Re-running the script with the same or updated inputs stays idempotent (spec 004 AC-10). | Primarily manual (writing a real file under `/etc/caddy/`, a real systemd drop-in under `/etc/systemd/system/caddy.service.d/`, and running `systemctl daemon-reload` only exist on a real LXC). `tests/unit/infra-setup-lxc.test.ts` (same file as AC-1) additionally asserts, by reading the script's source rather than executing the privileged parts, that it references exactly one `EnvironmentFile=` destination path and exactly one drop-in path (no drift between what the script writes and what its own header comment / the runbook documents — see task 10). Idempotency (second run with unchanged inputs does not unnecessarily `restart` Caddy; a changed variable value does) is a manual runbook verification item, same as spec 004's existing AC-10 treatment of this script. |

## Tasks

1. **Discover required variables from `infra/Caddyfile` itself**, instead of hardcoding
   `PROD_HOSTS`/`STAGING_HOSTS` in two places that could drift. Add a small step near the top of
   `infra/setup-lxc.sh` that greps the shipped `infra/Caddyfile` for `\{\$[A-Z_]+\}` tokens,
   dedupes them, and uses that list as "the set of variables this script must resolve." File:
   `infra/setup-lxc.sh`.
2. **Move required-variable resolution/check to the very top of the script**, before the existing
   root (`EUID`) check and before any install step. **Resolved (per Andrius' explicit instruction,
   superseding Open questions 1-2): variables are supplied via two checked-in, per-environment
   `.env` files**, not CLI flags: `infra/production.env` (`PROD_HOSTS=riauba.org`) and
   `infra/staging.env` (`STAGING_HOSTS=staging.riauba.org`). These are plain `KEY=VALUE` files,
   committed to the repo (hostnames are not secrets — spec 004's own constraint), sitting next to
   `infra/Caddyfile`/`infra/setup-lxc.sh`. The script defines an explicit mapping from each
   Caddyfile-discovered variable (task 1) to the file that must define it (`PROD_HOSTS` →
   `production.env`, `STAGING_HOSTS` → `staging.env` — documented in the header comment, extended
   by hand if a third variable is ever added), reads each file relative to `$script_dir`, and — if
   either file is missing, unreadable, or doesn't actually define its expected variable — prints
   one line per problem (which file, which variable, why) to stderr and `exit 1`, before the root
   check, before `useradd`, before touching `/srv/riauba`, before touching Caddy at all. **Note on
   current hostname values**: `riauba.org`/`staging.riauba.org` are the spec's own "Later" (final,
   post-DNS-cutover) hostnames, not the "Now (temporary)" `*.riaubyne.eu` ones the rest of
   spec 004/the runbook currently assumes. Andrius asked for the final values explicitly — this
   plan does not second-guess that — but it means deploying this as-is performs the Caddy-side half
   of the spec's "Switch to riauba.org" cutover immediately: Caddy will only match requests for
   `riauba.org`/`staging.riauba.org`, so the site stops being reachable at the temporary
   `*.riaubyne.eu` hostnames unless the Cloudflare Tunnel's public-hostname routing is updated to
   match at the same time (a separate, Cloudflare-side manual step, already documented in the
   runbook's "Switch to riauba.org" checklist — just happening earlier than that checklist assumed).
   Files: `infra/setup-lxc.sh`, `infra/production.env` (new), `infra/staging.env` (new).
3. **Merge both files' values into a single systemd `EnvironmentFile`** (`/etc/caddy/env` — Open
   question 3, kept at the plan's original proposed default since Andrius didn't specify
   otherwise) as plain `KEY=VALUE` lines with no quoting (systemd's `EnvironmentFile` parser does
   not support shell-style quotes the way bash does — a design pitfall worth calling out explicitly
   in the script's comment so nobody "fixes" it by adding quotes later). Mode `0600`, owned by
   root (systemd reads this file as PID 1 before dropping privileges to the Caddy service user;
   these are hostnames, not secrets, but least-privilege file permissions cost nothing). This file
   is the single thing Caddy's systemd unit actually reads — `infra/production.env`/
   `infra/staging.env` are the script's checked-in *input*, `/etc/caddy/env` is its generated
   *output*, merging both inputs into the one process environment Caddy needs (it serves both
   environments' site blocks from one process). Rewritten on every run from the currently-resolved
   values (idempotent); the script notes internally whether the content actually changed from the
   previous run, since that decision drives task 6's reload-vs-restart choice. File:
   `infra/setup-lxc.sh`.
4. **Create/update the systemd drop-in** (`/etc/systemd/system/caddy.service.d/10-riauba-env.conf`
   — Open question 4, kept at the plan's original proposed default) containing:
   ```
   [Service]
   EnvironmentFile=/etc/caddy/env
   ```
   Run `systemctl daemon-reload` whenever the drop-in or the env file's content changed in this run
   (cheap and idempotent to run unconditionally too, if that's simpler to get right — a design
   detail, not a correctness requirement). File: `infra/setup-lxc.sh`.
5. **Validate the Caddyfile before it is ever installed to `/etc/caddy/Caddyfile`, not after.**
   **Resolved (Open question 6): the stricter reading.** Change the existing "install Caddyfile +
   reload" step so it: exports the resolved variables into the script's own shell, runs
   `caddy validate --config "$script_dir/Caddyfile"` against the *source* file still sitting in the
   repo checkout; on failure, prints a clear message and `exit`s non-zero **without installing
   anything or touching the running Caddy service** — chosen so a bad Caddyfile is never even
   placed at the live config path where someone might assume it's already active. Only on success
   does the script `install -m 0644` the Caddyfile to `/etc/caddy/Caddyfile`. File:
   `infra/setup-lxc.sh`.
6. **Reload vs. restart Caddy correctly.** A process only reads its environment at start-up —
   `caddy reload`'s live-config-reload (via Caddy's admin API) never re-reads the systemd unit's
   `EnvironmentFile`. So: if task 3/4's env file or drop-in content changed in this run (first run,
   or a changed hostname value), the script must `systemctl daemon-reload && systemctl restart
   caddy` (not just reload) for the new variables to actually take effect; if they're unchanged and
   only the Caddyfile itself may have changed, the existing `systemctl reload caddy ||
   systemctl restart caddy` fallback is sufficient and cheaper. File: `infra/setup-lxc.sh`.
7. **Idempotency pass.** Re-read the whole script end to end with "run this a second time, same
   inputs" and "run this a second time, changed `PROD_HOSTS`" both in mind (spec 004's existing
   AC-10): no step other than task 6's conditional restart should behave differently on a second
   run; nothing should fail if the `deploy` user/directories/Caddy install from steps 1–3 already
   exist (unchanged from today). File: `infra/setup-lxc.sh`.
8. **Update the script's own header comment** to document, in the same style as
   `infra/deploy.sh`'s/`infra/rollback.sh`'s detailed header comments: the variable-discovery
   mechanism, the three input sources and their precedence, the `EnvironmentFile`/drop-in paths,
   and the validate-before-install-before-reload ordering. File: `infra/setup-lxc.sh`.
9. **New test `tests/unit/infra-setup-lxc.test.ts`** (AC-1, AC-3): spawns the real script as a
   non-root process (works in this sandbox and in CI, neither of which runs tests as root) against
   a scratch copy of the script's directory with `infra/production.env`/`infra/staging.env`
   missing or incomplete, and separately with both present and correct, asserting the behaviour
   described in the Acceptance criteria → tests table above (clear, file-naming stderr message and
   non-root-check-not-yet-reached in the failure case; reaching the "must be run as root" message
   in the success case). Also add: (a) a static assertion reading the script's own source to
   confirm it references exactly one `EnvironmentFile=` path and one drop-in path, matching what
   task 10 documents; (b) a test asserting `infra/production.env` contains exactly
   `PROD_HOSTS=riauba.org` and `infra/staging.env` contains exactly
   `STAGING_HOSTS=staging.riauba.org` (so a future accidental edit to either checked-in file is
   caught immediately, not just at the next real deploy). File: `tests/unit/infra-setup-lxc.test.ts`
   (new).
10. **Update `docs/technical/runbook.md`:**
    - Step 2 ("Run `infra/setup-lxc.sh`"): note that `infra/production.env`/`infra/staging.env` are
      checked into the repo and read automatically — running the script no longer needs any manual
      variable-setting step before or during it.
    - Step 5 ("Set the GitHub Environment variables"): remove the paragraph that currently tells
      Andrius to set `PROD_HOSTS`/`STAGING_HOSTS` manually "e.g. in `/etc/default/caddy` or the
      systemd unit's `Environment=`" — that instruction is exactly today's gap. Replace it with a
      short pointer to `infra/production.env`/`infra/staging.env` as "the two files Caddy's
      hostnames live in, read automatically by `setup-lxc.sh` and merged into `/etc/caddy/env`;
      edit either file directly (then re-run `setup-lxc.sh`, or `systemctl daemon-reload &&
      systemctl restart caddy` yourself) for a later change."
    - **Add a prominent note**: these two files are already set to the spec's final "Later"
      hostnames (`riauba.org`/`staging.riauba.org`), not the temporary `*.riaubyne.eu` ones used
      elsewhere in this runbook until the Cloudflare Tunnel/DNS cutover — so the Cloudflare Tunnel's
      public-hostname routing must point at `riauba.org`/`staging.riauba.org` *before or at the
      same time* `setup-lxc.sh` is run, or the temporary hostnames the rest of this runbook
      currently assumes will stop resolving to anything Caddy matches.
    - "Switch to riauba.org" checklist: note that the Caddy-side step (updating `PROD_HOSTS`/
      `STAGING_HOSTS`) is already done as of this change — the remaining checklist items are the
      Cloudflare-side DNS/Tunnel steps.
    - Briefly mention `caddy validate` and the new drop-in in the "Architecture overview" or
      "Viewing logs" section, so the runbook accurately reflects what the script does end to end —
      useful when Andrius is debugging via `journalctl -u caddy`.
    File: `docs/technical/runbook.md`.
11. **Final gate.** `make lint` (unchanged: `bash -n infra/setup-lxc.sh` stays syntax-only locally),
    `make test` (new Vitest test green, existing 215 unaffected), `shellcheck infra/*.sh` must stay
    green in CI (quote every new expansion; this sandbox has no `shellcheck` binary either, per the
    original spec 004 ship log, so this genuinely can only be confirmed on CI's first run). **Also
    extend the existing "Validate infra/Caddyfile" CI step** (Open question 7, resolved: yes, add
    this) with a second `caddy validate` invocation that deliberately omits one of `PROD_HOSTS`/
    `STAGING_HOSTS`, asserting Caddy itself fails validation without it — directly proving the
    failure mode that caused Andrius' original unclear error is actually caught, not just the
    happy path. `make docs` (confirm the runbook edits don't break `mkdocs build --strict`'s
    nav/link checking). No change expected to `make security`/`make e2e`. **Manual-only, by
    Andrius, against the real LXC**: re-run `infra/setup-lxc.sh` (a) with one of the two `.env`
    files temporarily renamed away — confirm the error names it correctly and nothing was touched;
    (b) with a deliberately broken Caddyfile — confirm `caddy validate` catches it before any
    reload and the previously-running Caddy keeps serving the old config; (c) a clean run end to
    end — confirm Caddy actually serves `riauba.org`/`staging.riauba.org` (the original bug, now
    fixed) *and* confirm the Cloudflare Tunnel hostname routing has been updated to match before
    relying on this; (d) a second, unchanged re-run — confirm it's a no-op reload, not a restart;
    (e) a re-run with one hostname changed in its `.env` file — confirm it restarts and the new
    hostname takes effect. This closes the loop on the real error Andrius hit.

## Design decisions

- **Required variables are discovered dynamically from `infra/Caddyfile`** (regex over `{$VAR}`
  tokens) rather than hardcoded as `PROD_HOSTS`/`STAGING_HOSTS` a second time inside
  `setup-lxc.sh` — today that happens to be the complete list (confirmed by reading the file), but
  this removes the risk of the script and the Caddyfile silently drifting apart if a future change
  adds a third variable.
- **Variable resolution and the fail-fast check happen before the root (`EUID`) check**, not
  after. This is both the literal "before install" reading of requirement 1 (checking root
  identity is itself a pre-install gate) and what makes AC-1 testable at all without root: a
  Vitest test can run the real script as an ordinary user and observe the variable-check's error
  message specifically, rather than always hitting "must be run as root" first regardless of
  input. This is a behavioural change from today's script (which currently fails on the root
  check first, unconditionally) — called out here so it isn't mistaken for an unrelated
  regression.
- **The Caddyfile is validated from its source location in the repo checkout, before `install`,
  not after `install` and before only the reload.** A stricter reading than the literal "before
  reload, run validate" text: it means an invalid Caddyfile is never placed at
  `/etc/caddy/Caddyfile` at all, so nothing — not even a human reading that path — can mistake a
  broken, uninstalled config for a broken, live one. Flagged as Open question 6 in case Andrius
  wants the simpler, literal reading instead.
- **`EnvironmentFile` lines use no quoting.** systemd's `EnvironmentFile=` parser is not a shell:
  values are *not* quote-stripped the way `KEY="value"` would be in bash, so the script must write
  `KEY=value` literally. Documented explicitly in the script's header comment (task 8) to prevent
  a future "helpful" quoting fix from silently breaking Caddy's hostname matching.
- **Reload vs. restart is decided by whether the environment itself changed, not just the
  Caddyfile.** A systemd `EnvironmentFile`/drop-in is only read when the service's process starts;
  `caddy reload`'s own mechanism (telling the running Caddy process to hot-swap its config via its
  admin API) never re-reads that file. Conflating the two would mean a first-ever run, or any run
  that changes a hostname, silently keeps the *old* (or still-empty) environment live even though
  the script reports success.
- **No new ADR.** This plan fixes an operational gap inside the architecture ADR-0005 already
  describes (self-hosted runner, Caddy on the homelab LXC, TLS at Cloudflare) — no new dependency,
  external service or data model is introduced, so the "if a decision is significant... also draft
  an ADR" bar isn't met.
- **Testing boundary is unchanged from spec 004's own accepted limitation**: only the
  variable-resolution/fail-fast logic (pure bash string/control-flow logic, reachable without root,
  `apt`, or a real `caddy`/`systemd`) gets an automated Vitest test. `caddy validate`, the
  `EnvironmentFile`/drop-in creation, `systemctl daemon-reload`, and the reload-vs-restart choice
  stay manual-only, exactly like the rest of `infra/setup-lxc.sh` already was in spec 004's plan
  ("nothing in this repo's CI can exercise... `infra/setup-lxc.sh` against a real LXC... by
  construction").
- **Hostnames are not secrets** (spec 004's constraint: "no secrets required for deploy"; the
  temporary hostnames are already printed in `docs/technical/runbook.md`), so the new
  `EnvironmentFile` needs no secret-handling beyond ordinary root-only file permissions — it is not
  a candidate for a GitHub Actions secret or any encrypted-at-rest requirement.

## Risks

- **The exact capabilities of the official Caddy Debian package's shipped systemd unit cannot be
  verified from this repo** — whether it already defines its own `EnvironmentFile=` directive, and
  under what exact path, is something only Andrius can confirm by inspecting
  `/lib/systemd/system/caddy.service` on the real LXC (or via `systemctl cat caddy`). The drop-in
  approach in task 4 works regardless of what the packaged unit already does (a drop-in always
  layers on top), but the proposed path (`/etc/caddy/env`) should be treated as provisional until
  confirmed against the real installed unit during the manual verification in task 11.
- **CI's existing `caddy validate` step uses the `caddy:2` Docker tag, which may not match
  whatever `apt-get install caddy` resolves to on the LXC** — a pre-existing risk from spec 004,
  not introduced by this plan, but worth remembering when task 11's manual verification is the
  only thing that exercises the *real* `caddy` binary end to end.
- **`shellcheck` cannot be run locally in this environment** (no `shellcheck` binary available, per
  the spec 004 ship log's own note) — the new code in `infra/setup-lxc.sh` can only be confirmed
  shellcheck-clean once pushed to CI, same residual risk the original spec 004 implementation
  already carried.
- **Reordering the root check to run after the variable check is a behavioural change** from
  today's script (which currently always fails on "must be run as root" first, regardless of
  input) — low risk, since nothing in the repo depends on today's ordering, but worth a line in
  the runbook/commit message so it isn't mistaken for a regression during review.

## Resolved decisions

Andrius replied "tesk toliau" (proceed), then — when asked to proceed with the plan's own proposed
defaults for all 7 open questions — interrupted with an explicit instruction for questions 1-4,
and asked for 5-7 to be decided by this plan. Final decisions:

1-2. **Input mechanism (overrides the plan's original args/env/file proposal): two checked-in
   `.env` files, `infra/production.env` and `infra/staging.env`**, no CLI flags, no "already
   exported shell var" fallback. Andrius specified both the file-per-environment split and their
   exact content: `infra/production.env` → `PROD_HOSTS=riauba.org`; `infra/staging.env` →
   `STAGING_HOSTS=staging.riauba.org`. These are the spec's own final "Later" hostnames, not the
   "Now (temporary)" `*.riaubyne.eu` ones — see task 2's note and the new runbook warning (task 10)
   on what this means for the Cloudflare Tunnel side of the cutover.
3. **Generated `EnvironmentFile` path: `/etc/caddy/env`** — kept at the plan's original proposed
   default (Andrius didn't specify otherwise). This is the script's *output* (merged from the two
   input files above), distinct from them.
4. **Systemd drop-in path: `/etc/systemd/system/caddy.service.d/10-riauba-env.conf`** — kept at the
   plan's original proposed default (no homelab-specific naming convention was specified).
5. **Scope confirmed: exactly `PROD_HOSTS`/`STAGING_HOSTS`, nothing else** — matches what reading
   `infra/Caddyfile` shows today; task 1's dynamic discovery still protects against future drift.
6. **Validate-before-install: the stricter reading** — the Caddyfile is validated from its source
   location in the repo checkout before it's ever installed to `/etc/caddy/Caddyfile`, so a broken
   config is never placed at the live path at all (task 5).
7. **Test scope: the one planned Vitest test, plus one addition.** `tests/unit/
   infra-setup-lxc.test.ts` covers the fail-fast file-check logic (task 9) — the only part of this
   script reachable without root/a real LXC, same boundary as the rest of spec 004. Additionally,
   extend the existing CI-only "Validate infra/Caddyfile" step (task 11) with a second
   `caddy validate` invocation that deliberately omits one required variable, so CI directly proves
   the exact failure mode that caused Andrius' original unclear error is now caught — cheap, and
   worth having given this whole follow-up exists because that failure mode wasn't visible enough.

## Open questions (historical — superseded by "Resolved decisions" above)

1. **How should `PROD_HOSTS`/`STAGING_HOSTS` be supplied to the script — arguments, a `.env` file,
   or both?** Andrius' text says "iš argumentų ar .env failo" (from arguments *or* a `.env` file).
   Should the script support both, with a defined precedence (this plan proposes: CLI
   args/flags > already-exported shell vars > an existing env file, so idempotent re-runs that
   supply nothing still work from what's already on disk), or does Andrius want just one
   mechanism to keep the script simpler?
2. **Exact flag/argument names and `.env` file format/location**, if arguments and/or a separate
   input `.env` file (distinct from the generated `/etc/caddy/env`) are wanted. Proposed:
   `--prod-hosts=<value> --staging-hosts=<value>` flags, no separate input `.env` file — the
   script reads/writes `/etc/caddy/env` directly as both its persisted state and its own idempotent
   re-run source. Please confirm or specify otherwise.
3. **`EnvironmentFile` destination path**: is `/etc/caddy/env` (this plan's proposal) acceptable,
   or is there a preferred convention — e.g. Debian's traditional `/etc/default/caddy`
   (sysvinit-style env file, sometimes still read by distro-packaged systemd units via their own
   `EnvironmentFile=/etc/default/<service>` line), which would make task 4's drop-in unnecessary if
   the packaged unit already reads that path?
4. **Systemd drop-in file name**: is `/etc/systemd/system/caddy.service.d/10-riauba-env.conf` fine,
   or is there a preferred naming convention for homelab drop-ins Andrius already uses for other
   LXCs/services?
5. **Scope confirmation**: today `infra/Caddyfile` references only `{$PROD_HOSTS}`/
   `{$STAGING_HOSTS}` (confirmed by reading the file) — please confirm no other variable is
   currently intended, so task 1's dynamic-discovery mechanism doesn't need to anticipate anything
   beyond what's already there (it will automatically pick up any future addition, but it's worth
   confirming today's scope is exactly these two).
6. **Validate-before-install strictness**: this plan proposes validating the *source* Caddyfile in
   the repo checkout before ever installing it to `/etc/caddy/Caddyfile` (task 5/Design decisions),
   which is stricter than the literal "before reload, run validate" wording. Is that the wanted
   behaviour, or is the simpler reading — install the Caddyfile unconditionally, but gate only the
   reload/restart on `caddy validate` against the now-installed copy — preferred instead?
7. **New automated test scope**: this plan adds exactly one new Vitest test
   (`tests/unit/infra-setup-lxc.test.ts`) covering only the fail-fast variable check, consistent
   with spec 004's existing "manual-only beyond `bash -n`" treatment of this script. Confirm this
   slice of automated coverage is sufficient, or whether more (e.g. a CI-only step that runs
   `caddy validate` once with a variable deliberately unset, to prove validation genuinely fails
   without it, alongside the existing "Validate infra/Caddyfile" CI step) is wanted.
