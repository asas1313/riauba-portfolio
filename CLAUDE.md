# riauba.org – Andrius' personal site

Personal portfolio of Andrius R., Senior Java Developer (payments, banking) and AI Engineer.
Audience: recruiters and hiring managers (Scandinavia, EU, Lithuania). Primary language English,
Lithuanian version later (spec 005).

## Stack
- Astro 7 (static output), TypeScript strict, plain CSS (no Tailwind), zero client JS by default
  (upgraded from Astro 5 during spec 001: 5.x/6.x had unpatched critical/high npm audit advisories)
- Content: `content/cv.yaml` (single source of truth for CV) and `content/projects/*.md` (Astro content collections)
- PDF CV generated at build time with Playwright printing the `/cv/print` route → `dist/andrius-riauba-cv.pdf`
- Tests: Vitest (unit, content schema validation), Playwright (e2e, accessibility via @axe-core/playwright)
- Docs: MkDocs Material under docs/
- Hosting: Caddy on Andrius' Proxmox homelab, deployed via a self-hosted GitHub Actions runner (no secrets); temporary `*.riaubyne.eu` hostnames until `riauba.org` DNS is live (spec 004, see `docs/technical/runbook.md`)

## Commands
- `make setup` · `make test` · `make e2e` · `make lint` · `make format` · `make security` · `make docs` · `make build`

## Conventions
- All personal data comes from `content/` – never hard-code CV facts in components.
- Content schemas are validated with Zod; a build must fail on invalid content.
- Performance budget: Lighthouse ≥ 95 in all categories, total page weight < 300 KB (excluding PDF).
- Accessibility: WCAG 2.2 AA, no axe violations.
- Privacy: no third-party trackers, no Google Fonts CDN (self-host fonts), no cookies.
- Anything marked `TODO` in content/ is filled in by Andrius – never invent personal facts, dates or employers.

## Definition of done
Same as claude-factory: every AC tested, make test/lint/security/docs green, reviewer APPROVED, docs updated.
