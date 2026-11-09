.PHONY: setup test e2e screenshots lint lint-changed format format-file security docs build smoke visual visual-update

# Spec 004, AC-9: `mkdocs build`'s output directory. Defaults to `site`
# (today's behaviour, unchanged for plain `make docs`/CI); the deploy
# workflows override it to `dist/docs` so the MkDocs site ships inside the
# same build artifact as the rest of the site, under /docs/.
SITE_DIR ?= site

# Playwright Docker image pinned to the exact @playwright/test version in
# package-lock.json (tests/unit/playwright-docker-version.test.ts enforces
# this matches). Must stay in lockstep with .github/workflows/ci.yml's
# visual job and with @playwright/test's version in package.json.
PLAYWRIGHT_DOCKER_IMAGE := mcr.microsoft.com/playwright:v1.65.0-noble

setup:
	npm ci
	npx playwright install --with-deps chromium

test:
	npx vitest run --passWithNoTests

e2e: build
	npx playwright test

# Explicit, opt-in regeneration of docs/user-guide/img/*.png. Not part of
# `make e2e`/CI: it overwrites tracked screenshots and must only run when
# someone deliberately asks for it.
screenshots: build
	npm run capture-screenshots

# Visual-regression suite (spec 005, AC-8/AC-11; see ADR-0004). Asserts
# against committed baselines under tests/visual/pages.spec.ts-snapshots/.
# Runs *inside* the pinned Playwright Docker image, never on the bare
# host, so font rendering is identical to CI regardless of the
# contributor's own OS. `--user $(id -u):$(id -g)` keeps any
# generated/updated snapshot files owned by the host user, not root;
# `--ipc=host` is Playwright's documented requirement to avoid Chromium
# crashing under Docker's default shared-memory limits. Requires Docker
# locally (not installed by `make setup`).
visual: build
	docker run --rm --user $$(id -u):$$(id -g) --ipc=host \
		-v "$$PWD:/work" -w /work $(PLAYWRIGHT_DOCKER_IMAGE) \
		npx playwright test --config=playwright.visual.config.ts

# Explicit, opt-in regeneration of tests/visual/pages.spec.ts-snapshots/
# baselines. The *only* supported way to change a baseline PNG -- a
# bare-host run would silently commit host-specific rendering artefacts
# (mirrors the existing `screenshots` target's "explicit opt-in,
# overwrites tracked files" convention).
visual-update: build
	docker run --rm --user $$(id -u):$$(id -g) --ipc=host \
		-v "$$PWD:/work" -w /work $(PLAYWRIGHT_DOCKER_IMAGE) \
		npx playwright test --config=playwright.visual.config.ts --update-snapshots

# Spec 004, task 11: syntax-only (`bash -n`) checking of the three
# infra/*.sh scripts, locally -- full `shellcheck` only runs in CI
# (.github/workflows/ci.yml), since `shellcheck` isn't installed by
# `make setup` and these scripts aren't run more than a handful of times
# ever.
lint:
	npx astro check && npx eslint . && npx prettier --check . && \
		bash -n infra/setup-lxc.sh && bash -n infra/deploy.sh && bash -n infra/rollback.sh

lint-changed:
	@$(MAKE) -s lint

format:
	npx prettier --write .

format-file:
	@npx prettier --write "$(FILE)" >/dev/null 2>&1 || true

security:
	npm audit --audit-level=high

docs:
	@pip install -q mkdocs-material >/dev/null 2>&1 || true
	mkdocs build --strict --site-dir $(SITE_DIR)

# Spec 004, AC-1/task 1: default SITE_URL to https://riauba.org only when
# truly unset (`${SITE_URL-default}`, deliberately no colon) so an existing
# GitHub Environment variable that is configured but left empty reaches
# resolveSiteUrl() as an empty string and fails the build loudly, instead of
# silently substituting the default the way `${SITE_URL:-default}` would.
build:
	SITE_URL=$${SITE_URL-https://riauba.org} npm run build
	npm run build:pdf

# Spec 004, AC-8/task 10. The old rsync/SSH `deploy` target is gone for
# good -- deploy only ever happens from infra/deploy.sh on the homelab
# runner itself (invoked directly by the deploy workflows), so there is no
# meaningful "local" `make deploy` against a homelab LXC any more.
#
# `make smoke ENV=<staging|production> [SHA=<sha>]`: resolves the public
# URL from STAGING_URL/PROD_URL (falling back to the real riauba.org
# hostnames -- the temporary *.riaubyne.eu hostnames from spec 004's
# initial rollout are retired, see the runbook's "Switch to riauba.org"
# checklist), checks `/`, `/cv`, `/projects`, the
# real CV PDF filename and `/docs/` all return 200, optionally compares
# `/version.txt` to SHA when given, and for ENV=staging additionally
# requires the X-Robots-Tag noindex header on every response.
smoke:
	@test -n "$(ENV)" || (echo "ENV is required" && exit 1)
	@case "$(ENV)" in \
		staging | production) ;; \
		*) echo "smoke FAILED: ENV must be 'staging' or 'production', got '$(ENV)'"; exit 2 ;; \
	esac
	@url=$$( [ "$(ENV)" = "production" ] \
		&& echo "$${PROD_URL-https://riauba.org}" \
		|| echo "$${STAGING_URL-https://staging.riauba.org}" ); \
	for path in / /cv /projects /andrius-riauba-cv.pdf /docs/; do \
		curl -fsS "$$url$$path" >/dev/null || { echo "smoke FAILED: $$url$$path"; exit 1; }; \
	done; \
	if [ -n "$(SHA)" ]; then \
		deployed_sha=$$(curl -fsS "$$url/version.txt"); \
		[ "$$deployed_sha" = "$(SHA)" ] || { echo "smoke FAILED: version.txt='$$deployed_sha' expected '$(SHA)'"; exit 1; }; \
	fi; \
	if [ "$(ENV)" = "staging" ]; then \
		header=$$(curl -fsSI "$$url/" | tr -d '\r' | grep -i '^x-robots-tag:'); \
		case "$$header" in \
			*"noindex, nofollow"*) ;; \
			*) echo "smoke FAILED: missing X-Robots-Tag: noindex, nofollow on staging"; exit 1 ;; \
		esac; \
	fi; \
	echo "smoke OK: $$url"
