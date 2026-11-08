.PHONY: setup test e2e screenshots lint lint-changed format format-file security docs build deploy smoke

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

build:
	npm run build
	npm run build:pdf

deploy:
	@test -n "$(ENV)" || (echo "ENV is required" && exit 1)
	rsync -az --delete dist/ $$DEPLOY_USER@$$DEPLOY_HOST:$$DEPLOY_PATH/

smoke:
	@url=$$( [ "$(ENV)" = "production" ] && echo https://riauba.org || echo https://staging.riauba.org ); \
	curl -fsS $$url/ >/dev/null && curl -fsS $$url/andrius-riauba-cv.pdf >/dev/null && echo "smoke OK: $$url"
