.PHONY: setup test e2e screenshots lint lint-changed format format-file security docs build deploy smoke visual visual-update

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

lint:
	npx astro check && npx eslint . && npx prettier --check .

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
	mkdocs build --strict

# Spec 004, AC-1/task 1: default SITE_URL to https://riauba.org only when
# truly unset (`${SITE_URL-default}`, deliberately no colon) so an existing
# GitHub Environment variable that is configured but left empty reaches
# resolveSiteUrl() as an empty string and fails the build loudly, instead of
# silently substituting the default the way `${SITE_URL:-default}` would.
build:
	SITE_URL=$${SITE_URL-https://riauba.org} npm run build
	npm run build:pdf

deploy:
	@test -n "$(ENV)" || (echo "ENV is required" && exit 1)
	rsync -az --delete dist/ $$DEPLOY_USER@$$DEPLOY_HOST:$$DEPLOY_PATH/

smoke:
	@url=$$( [ "$(ENV)" = "production" ] && echo https://riauba.org || echo https://staging.riauba.org ); \
	curl -fsS $$url/ >/dev/null && curl -fsS $$url/andrius-riauba-cv.pdf >/dev/null && echo "smoke OK: $$url"
