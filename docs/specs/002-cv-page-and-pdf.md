# 002 – CV page and downloadable PDF

Status: Final  ·  Owner: Andrius  ·  Date: 2026-11-08
PR: https://github.com/asas1313/riauba-portfolio/pull/3

## Goal
A full CV page and an always-up-to-date PDF CV, both generated from content/cv.yaml.

## User stories
- As a recruiter, I want to read the full CV on the web and download a PDF, so that I can forward it internally.
- As Andrius, I want to edit one YAML file and get both, so that they never diverge.

## Acceptance criteria
- **AC-1** Given cv.yaml, when /cv renders, then it shows summary, work (reverse chronological), skills, education, languages and certificates (sections with no data are hidden).
- **AC-2** Given any field whose value is "TODO" or contains "TODO", when the site builds in production mode, then that field is omitted from both web and PDF, and the build prints a warning listing all TODO fields.
- **AC-3** Given /cv/print, when rendered, then it is a print-optimised A4 layout (max 2 pages for the current content, no navigation, links printed as text).
- **AC-4** Given `make build`, then Playwright prints /cv/print to dist/andrius-riauba-cv.pdf, and the PDF contains selectable text including basics.name.
- **AC-5** Given /cv and the home page, then a clearly visible "Download CV (PDF)" link points to /andrius-riauba-cv.pdf.
- **AC-6** Given /cv, then it includes JSON-LD (schema.org Person) built from cv.yaml.

## Non-goals
- Multiple CV variants, Lithuanian CV (spec 005).

## Open questions
- None.
