# 001 – Site foundation and home page

Status: Final  ·  Owner: Andrius  ·  Date: 2026-11-08
PR: https://github.com/asas1313/riauba-portfolio/pull/2

## Goal
A fast, accessible static site skeleton for riauba.org with a home page that tells a recruiter in 10 seconds who Andrius is.

## Context
New repository scaffolded from claude-factory. Content lives in content/ (see CLAUDE.md). No code exists yet.

## User stories
- As a recruiter, I want to see Andrius' role, core skills and a way to contact him immediately, so that I can decide whether to read further.
- As Andrius, I want all text to come from content files, so that I can update the site without touching code.

## Acceptance criteria
- **AC-1** Given the repo, when `make setup && make build` runs, then an Astro static site is produced in dist/ with no client-side JavaScript on the home page.
- **AC-2** Given content/cv.yaml, when the home page renders, then it shows basics.name, basics.label, basics.summary, the "remote" line and links to every entry in basics.profiles that is not "TODO".
- **AC-3** Given content/cv.yaml with an invalid structure (e.g. missing basics.name), when the build runs, then it fails with a readable validation error (Zod schema).
- **AC-4** Given the home page, when it renders, then it shows the featured projects (featured: true) ordered by `order`, each linking to /projects/<slug>.
- **AC-5** Given any page, when rendered, then a shared header (Home, Projects, CV, How this site was built) and footer (email, LinkedIn, © year) are present.
- **AC-6** Given any page, when tested with axe in Playwright, then there are zero violations, and both light and dark colour schemes (prefers-color-scheme) are supported.
- **AC-7** Given the built home page, then its total transferred weight is below 300 KB and fonts are self-hosted.
- **AC-8** Given any page, then it has a unique <title>, meta description, Open Graph tags and a canonical URL on https://riauba.org.
- **AC-9** Given an unknown URL, then a styled 404 page is served.

## Non-goals
- CV page and PDF (spec 002), project detail pages (spec 003), deployment (spec 004), Lithuanian version (005).

## Non-functional requirements
- Lighthouse ≥ 95 in all categories (checked in e2e with a budget test where feasible).
- No cookies, no analytics, no third-party requests.

## Constraints
- Astro 5, TypeScript strict, plain CSS. Visual style: clean, typographic, professional; one accent colour.

## Open questions
- None.
