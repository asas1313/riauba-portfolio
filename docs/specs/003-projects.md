# 003 – Projects catalogue and detail pages

Status: Final  ·  Owner: Andrius  ·  Date: 2026-11-08
PR: https://github.com/asas1313/riauba-portfolio/pull/4

## Goal
Every project Andrius has is reachable from the site, each with its own page linking to the live app, docs and repo.

## User stories
- As a hiring manager, I want to browse projects and filter by technology, so that I can see relevant experience.
- As Andrius, I want to add a project by adding one markdown file, so that the catalogue grows without code changes.

## Acceptance criteria
- **AC-1** Given content/projects/*.md, when /projects renders, then all projects are listed ordered by `order`, each with title, tagline, status badge and stack tags.
- **AC-2** Given a project file with invalid frontmatter, when building, then the build fails with a readable error.
- **AC-3** Given /projects, when a visitor selects a stack tag, then only projects with that tag are shown; this works without JavaScript via /projects/tag/<tag> static pages.
- **AC-4** Given /projects/<slug>, then the page renders the markdown body and shows buttons for links.live, links.docs and links.repo only when they are set (not null, not "TODO").
- **AC-5** Given paragraphs starting with "TODO", when building in production mode, then they are omitted and reported as warnings (same mechanism as spec 002).
- **AC-6** Given /how-this-site-was-built, then it explains the AI delivery pipeline and lists every spec in docs/specs/ (number, title, status) with links to the corresponding merged PRs (URLs read from a `pr:` field added to spec files, omitted if absent).

## Non-goals
- Screenshots gallery, search.

## Open questions
- None.
