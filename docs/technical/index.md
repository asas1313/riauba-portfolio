# Technical documentation

_Architecture, module responsibilities, configuration, runbook — for riauba.org as implemented
by spec 001 (site foundation and home page), spec 002 (CV page and PDF) and spec 003 (projects
catalogue and detail pages)._

!!! note "Scope"
    This describes what is built today: the static site skeleton, home page, the CV page and
    downloadable PDF (`/cv`, `/cv/print`), and the projects catalogue, tag filter and detail
    pages plus the "How this site was built" page (`/projects`, `/projects/tag/<tag>`,
    `/projects/<slug>`, `/how-this-site-was-built`). Hosting and deployment are spec 004's
    scope — not built on this branch.

## Architecture overview

riauba.org is a static site built with [Astro](https://astro.build) 7 (`output: "static"`,
see [Configuration](#configuration)). There is no server at request time: `astro build`
produces plain HTML/CSS/font files in `dist/`, which are served as-is (see
[Hosting](#runbook) below for how that happens in production).

Content is intentionally kept outside `src/` in a `content/` directory at the repository
root (per `CLAUDE.md`), and is loaded through two different, purpose-fit mechanisms —
documented and justified in
[ADR-0001](../adr/0001-content-loading-strategy.md).

```mermaid
flowchart TD
    subgraph content["content/ (repo root)"]
        cvyaml["cv.yaml<br/>(single YAML document)"]
        projmd["projects/*.md<br/>(one file per project)"]
    end

    subgraph docsspecs["docs/specs/ (repo root)"]
        specfiles["NNN-*.md<br/># NNN – Title / Status: ... / PR: &lt;url&gt;"]
    end

    subgraph lib["src/lib/"]
        todots["todo.ts<br/>TODO_PATTERN / isTodoMarked()"]
        cvts["cv.ts<br/>loads cv.yaml via Vite ?raw import"]
        cvschema["cv.schema.ts<br/>Zod schema + parseCv()"]
        cvpublishts["cv.publish.ts<br/>cvForBuild (TODO-stripping)"]
        structureddatats["structured-data.ts<br/>buildPersonJsonLd() / toSafeJsonLd()"]
        projectsts["projects.ts<br/>getAllProjectsSorted() / getFeaturedProjectsSorted()<br/>slugifyTag() / getAllTagSlugs() / getProjectsByTagSlug()"]
        projectlinksts["project-links.ts<br/>getVisibleProjectLinks()"]
        markdowntodots["markdown-todo.ts<br/>removeTodoParagraphs() / createSatteriTodoParagraphPlugin()"]
        specsts["specs.ts<br/>getSpecIndex()"]
        seots["seo.ts<br/>buildPageSeo()"]
    end

    contentconfig["src/content.config.ts<br/>defineCollection('projects')<br/>glob() loader + Zod schema"]
    astroconfig["astro.config.mjs<br/>integration wires markdown.processor:<br/>satteri({ mdastPlugins: [...] })"]

    subgraph pages["src/pages/ + src/components/"]
        indexastro["index.astro"]
        cvastro["cv.astro"]
        cvprintastro["cv/print.astro"]
        cvcontentastro["CvContent.astro"]
        projectsindexastro["projects/index.astro"]
        projectstagastro["projects/tag/[tag].astro"]
        projectslugastro["projects/[slug].astro"]
        projectcardastro["ProjectCard.astro"]
        howbuiltastro["how-this-site-was-built.astro"]
        notfound["404.astro"]
        baselayout["BaseLayout.astro<br/>Header + Footer + SEO tags"]
    end

    astrobuild["astro build"]
    dist["dist/ (static HTML/CSS/fonts)"]
    buildpdf["scripts/build-pdf.mjs<br/>npm run preview + Playwright print"]
    pdf["dist/andrius-riauba-cv.pdf"]

    cvyaml -->|"?raw string"| cvts
    cvts --> cvschema
    cvschema -->|"throws on invalid content<br/>(fails the build loudly)"| cvts
    todots --> cvpublishts
    todots --> projectlinksts
    cvts --> cvpublishts

    projmd -->|"glob('*.md')"| contentconfig
    contentconfig -->|"validates frontmatter<br/>against Zod schema"| contentconfig
    markdowntodots -->|"mdastPlugins: [createSatteriTodoParagraphPlugin(...)]"| astroconfig
    astroconfig -->|"renders project bodies<br/>(entry.rendered, cached at content-sync time)"| contentconfig

    cvpublishts --> indexastro
    cvpublishts --> cvastro
    cvpublishts --> cvprintastro
    structureddatats -->|"buildPersonJsonLd(cvForBuild)"| cvastro
    structureddatats -->|"cv.astro's result flows in as the<br/>structuredData prop; toSafeJsonLd()<br/>renders the &lt;script&gt; tag"| baselayout
    cvastro --> cvcontentastro
    cvprintastro --> cvcontentastro
    contentconfig --> projectsts
    projectsts --> indexastro
    projectsts --> projectsindexastro
    projectsts --> projectstagastro
    projectsts --> projectcardastro
    projectlinksts --> projectslugastro
    contentconfig --> projectslugastro
    docsspecs -->|"import.meta.glob('/docs/specs/*.md', ?raw)"| specsts
    specsts --> howbuiltastro
    seots --> baselayout
    baselayout --> indexastro
    baselayout --> cvastro
    baselayout --> notfound
    baselayout --> projectsindexastro
    baselayout --> projectstagastro
    baselayout --> projectslugastro
    baselayout --> howbuiltastro

    indexastro --> astrobuild
    cvastro --> astrobuild
    cvprintastro --> astrobuild
    notfound --> astrobuild
    projectsindexastro --> astrobuild
    projectstagastro --> astrobuild
    projectslugastro --> astrobuild
    howbuiltastro --> astrobuild
    astrobuild --> dist
    dist --> buildpdf
    buildpdf --> pdf
```

Key properties of this build:

- **Fails loudly on bad content.** `src/lib/cv.schema.ts`'s `parseCv()` throws an `Error`
  listing every failing field path when `content/cv.yaml` doesn't match its Zod schema (e.g. a
  missing `basics.name`); Astro's content collection does the equivalent for
  `content/projects/*.md` against the schema in `src/content.config.ts`. Either failure stops
  `astro build` — there is no way to ship invalid content.
- **Zero client-side JavaScript on the home page.** Every page is a plain `.astro` component;
  no UI framework integration is installed (see `astro.config.mjs`).
- **Content lives outside `src/`.** `content/cv.yaml` is read as a raw string via Vite's `?raw`
  import suffix (not `node:fs` at runtime) specifically so the path resolves correctly
  regardless of where Astro's prerendering step bundles the importing module — see the comment
  in `src/lib/cv.ts` and ADR-0001 for why a `fs.readFileSync` + computed path does not work here.

## Module responsibilities

### `src/lib/`

| Module | Responsibility |
| --- | --- |
| `cv.schema.ts` | Zod schema (`cvSchema`) matching the shape of `content/cv.yaml`; `parseCv(data)` validates and throws a readable, multi-issue error on failure. Exports the inferred `Cv`, `Profile` and `Work` types. |
| `cv.ts` | Loads `content/cv.yaml` (via a Vite `?raw` import, parsed with the `yaml` package) and validates it with `parseCv()` once at module load time, exporting the typed `cv` constant. Also exports `getWorkReverseChronological(work)`, which sorts work entries by `endDate` descending (an ongoing role with no `endDate` sorts as most recent), tie-broken by `startDate` descending. |
| `cv.publish.ts` | The site's TODO-filtering mechanism for `content/cv.yaml` (spec 002) — see [TODO filtering](#todo-filtering-cvpublishts) below. Exports `cvForBuild`, the one `Cv` value every page/component should import instead of the raw `cv` export from `cv.ts`. |
| `todo.ts` | Shared `TODO_PATTERN` (`/\bTODO\b/`, whole-word, case-sensitive) and `isTodoMarked(value)` helper (spec 003), extracted from `cv.publish.ts` so `project-links.ts` reuses the exact same matching rule. |
| `structured-data.ts` | `buildPersonJsonLd(cv)` maps `cv.basics` onto a [schema.org `Person`](https://schema.org/Person) object (name, jobTitle, email, url, address, `sameAs` profile URLs, description) for the `/cv` page's JSON-LD. `toSafeJsonLd(value)` serializes a value with `JSON.stringify` and escapes every literal `<` as `<` before it is injected into a `<script type="application/ld+json">` via `set:html`, so a CV field containing literal `<script>` text can never prematurely close the surrounding tag. |
| `projects.ts` | `getFeaturedProjectsSorted(entries)`/`getAllProjectsSorted(entries)` — pure helpers that sort `projects` collection entries by `order` ascending, filtered to `featured: true` or not filtered at all (spec 003, AC-1). `slugifyTag(tag)` lowercases a stack tag and collapses non-alphanumeric runs into single, trimmed hyphens. `getAllTagSlugs(entries)` groups every project under each of its tags' slug (AC-3) and **throws** a readable error — rather than silently merging — if two distinct tag labels slugify to the same non-empty slug, or if a label slugifies to the empty string. `getProjectsByTagSlug(entries, slug)` filters to projects whose `stack` includes a tag matching that slug. |
| `project-links.ts` | `getVisibleProjectLinks(links)` (spec 003, AC-4) — returns the ordered (live, docs, repo) link buttons a project detail page should render, dropping any value that is `null` or TODO-marked (via `todo.ts`'s `isTodoMarked`). **Unconditional**: identical in `astro dev` and `astro build`, unlike `markdown-todo.ts` below — a link button that literally read "TODO" would otherwise be visible (and clickable, pointing nowhere useful) in local dev. |
| `markdown-todo.ts` | TODO-*paragraph* stripping for `content/projects/*.md` bodies (spec 003, AC-5) — see [Markdown body TODO stripping](#markdown-body-todo-stripping-markdown-todots) below. |
| `specs.ts` | `getSpecIndex()` (spec 003, AC-6) — reads every `docs/specs/<NNN>-*.md` file (excluding `*.plan.md`/`*.log.md`/`_TEMPLATE.md`) via a Vite `import.meta.glob` raw import, parsing `{ number, title, status, pr? }` from each file's `# NNN – Title` / `Status: ...` / optional `PR: <url>` header lines, sorted ascending by number. Throws a readable error if a file has no parseable heading/status line, or if its filename's leading number disagrees with its own heading's. |
| `seo.ts` | `buildPageSeo(site, { title, description, path })` — builds the `<title>`, meta description, canonical URL and Open Graph tag values for a page. `resolveCanonicalUrl` guarantees the canonical/OG URL always stays on the configured `site` origin (collapsing protocol-relative `//host` paths and stripping any foreign scheme/host from an absolute URL before resolving), throwing rather than ever emitting an off-site URL. No `og:image` is set yet. |

**Two different TODO-handling code paths exist side by side**, and deliberately share no code:
`cv.publish.ts`'s whole-*field*, schema-aware stripping for `content/cv.yaml` (a typed object
tree, filtered at page-render time) and `markdown-todo.ts`'s whole-*paragraph*, mdast-aware
stripping for `content/projects/*.md` bodies (a markdown AST, filtered at content-sync time) —
see [Markdown body TODO stripping](#markdown-body-todo-stripping-markdown-todots) and
[ADR-0003](../adr/0003-project-body-todo-stripping.md) for why these can't share a single
implementation. `project-links.ts`'s link-button filter is a third, much smaller TODO check
(a single string equality/pattern test, no tree at all) that is unconditional rather than
prod-build-only — see its row above.

### TODO filtering (`cv.publish.ts`)

Every page and component that reads CV data imports `cvForBuild` from `src/lib/cv.publish.ts`
— never the raw `cv` export from `cv.ts` directly — so there is exactly one place in the
codebase that decides whether a `"TODO"`-marked placeholder in `content/cv.yaml` is visible.
This replaces spec 001's `getVisibleProfiles(profiles)` helper (removed), which only filtered
`basics.profiles` for the home page and footer; `cv.publish.ts` filters the *entire* CV tree
(profiles, work entries, highlights, education, languages, certificates — anything) and is
now also what the home page uses for its profile list, not a separate mechanism.

Behaviour:

- **Outside production builds** (`import.meta.env.PROD` is `false`, i.e. `astro dev` and
  `astro build --mode development`), `cvForBuild` is identical to the raw, unfiltered `cv` —
  every TODO placeholder renders as-is everywhere a page reads `cvForBuild`, including the
  home page. (Before spec 002, the home page additionally hid TODO profiles during local dev
  too; that special case is gone; dev now behaves the same as every other page.)
- **In production builds** (`npm run build` / `astro build`), `getPublishableCv` calls
  `stripTodoFields(cv)`, which deep-clones the parsed `Cv` and removes every field whose
  string value matches the whole-word, case-sensitive pattern `/\bTODO\b/` — so a literal
  word `TODO` anywhere, including inside a longer sentence like `"TODO: confirm start date"`,
  matches, but `"todo"` (lowercase), padded variants like `" TODO "`, and a mid-word substring
  such as `"Kristodoras"` do not. This is a deliberate narrowing from spec 001's
  case-insensitive, whitespace-trimmed substring match.
- `findTodoFields` recursively walks the cloned tree and returns the dot-path of every
  matching string leaf (array indices appear as numeric segments, e.g. `"work.0.endDate"`).
  `classifyTodoPath` then consults the Zod *shape* of `cvSchema` (not the data) to decide what
  stripping a given path means. **Why schema-aware rather than one blanket rule:** a single
  fixed policy is wrong in both directions. Always deleting just the field would publish a
  `Work` entry missing a *required* field (e.g. a TODO `position` but a real `name` and dates),
  silently shipping a half-filled record every downstream consumer (`CvContent.astro`, the PDF,
  the JSON-LD) assumes is complete. Always dropping the whole containing record instead would
  over-delete: a TODO in an *optional* field like `work[].endDate` (an ongoing role simply
  hasn't ended yet) or a single still-TODO item inside a plain string array like `highlights`
  would needlessly destroy an otherwise-complete, already-written work entry along with it.
  Consulting the schema's required/optional shape per field lets the stripper pick the
  narrowest removal that is still safe to publish for each case:
  - the path's last segment is an index into a plain string array (`highlights`, `skills.*.keywords`)
    → remove just that array element;
  - the path resolves to an **optional** object field (anything accepting `undefined`, checked
    via `fieldSchema.safeParse(undefined).success` rather than the deprecated `.isOptional()`)
    → delete just that field;
  - the path resolves to a **required** object field → drop the whole enclosing object from
    its containing array (a profile/work/education/language entry disappears entirely rather
    than being published half-filled).
  - a required field with **no** containing array to drop from (e.g. `basics.name` lives
    directly on the top-level `basics` object) is a deliberate hard failure, not a silent
    null-out: `stripTodoFields` throws, naming the exact field path, per this project's
    "fail loudly" convention — nulling `basics` would otherwise crash every downstream
    consumer with a cryptic `TypeError` instead of a clear message.
- Every path actually stripped is reported once via `console.warn`, listing all stripped
  dot-paths, so a production build that silently drops content is still visible in the build
  log.

### Markdown body TODO stripping (`markdown-todo.ts`)

Spec 003's AC-5 requires that any top-level paragraph in a `content/projects/*.md` body
starting with the literal word `TODO` is omitted from the production build, with a build
warning — the same marker and whole-word/case-sensitive rule as `cv.publish.ts`, but applied to
a markdown AST instead of a parsed JS object tree, because by the time a page could mutate an
entry's raw body, Astro has already rendered it to cached HTML — see
[ADR-0003](../adr/0003-project-body-todo-stripping.md) for the full reasoning.

- `removeTodoParagraphs(tree)` walks an mdast root's *direct* children only; for each top-level
  `paragraph` it computes the **recursively-joined plain text** (concatenating every descendant
  text node's `.value`, depth-first, across all inline children — so a leading `**TODO**` bold
  run is caught, not just a bare leading text node) and removes the paragraph if that text
  matches `/^TODO\b/`. A TODO paragraph nested inside a list item or blockquote is left
  untouched — a documented limitation, not a bug (see ADR-0003's Consequences).
- `remarkStripTodoParagraphs({ enabled, warn })` wraps that in the classic unified/remark
  "attacher" shape the mechanism was originally designed around.
- **The real build wiring doesn't use that classic shape**, because Astro 7.4 (the version this
  repo pins) ships **Sätteri**, not the classic `unified`/`remark` pipeline, as its *default*
  Markdown processor, and `markdown.remarkPlugins` throws a config-validation error unless the
  separate `@astrojs/markdown-remark` package is installed too — confirmed by actually running
  `astro build` with it configured (see ADR-0003's Addendum). Production wiring instead goes
  through `createSatteriTodoParagraphPlugin`, targeting Sätteri's own native mdast-plugin shape:
  a `before(root, context)` hook (run once per document, before Sätteri's own visitors) that
  removes each matching top-level paragraph via `context.removeNode(node)` (Sätteri's tree is
  read-only from plugin code; there is no `tree.children` array to reassign).
- `astro.config.mjs` registers the stripping via a small inline integration's `astro:config:setup`
  hook (`markdown.processor: satteri({ mdastPlugins: [createSatteriTodoParagraphPlugin({ enabled:
  command === "build", warn: () => {} }) ] })`), **not** a functional
  `defineConfig(({ command }) => ({ ... }))` default export — Astro's own `defineConfig` is a
  plain identity function and never calls a function passed as the config's default export
  (also confirmed empirically; see ADR-0003's Addendum). TODOs render as-is in `astro dev`, are
  stripped in `astro build`, mirroring `cv.publish.ts`'s `import.meta.env.PROD` gating via the
  config-time `command` equivalent.
- **The build warning is emitted from a separate, cache-independent path, not from the Sätteri
  plugin above.** Astro's content-layer glob loader skips re-rendering a file (and therefore
  skips re-invoking the Sätteri plugin's `before` hook) whenever the file's on-disk content
  digest is unchanged since the last sync — correct for reusing already-rendered HTML, but wrong
  for a side-effecting warning: a second `astro build` in a row against an unchanged, warm
  content-layer cache would otherwise never warn again, even though the (still correctly
  stripped) output is unchanged. So `createSatteriTodoParagraphPlugin`'s own `warn` is wired as a
  no-op in production, and the same integration also hooks `astro:build:start` — which Astro
  calls unconditionally, once per `astro build`, before any content-layer sync happens — to call
  `warnAboutTodoParagraphsInFiles`, which scans `content/projects/*.md` directly off disk (its own
  dependency-free, text-level approximation of "top-level TODO paragraph", independent of mdast
  or the content-layer cache entirely) and warns once per affected file. This fires on every
  build, cold or warm cache alike; see ADR-0003's Addendum for the investigation.

### `src/content.config.ts`

Defines the `projects` Astro content collection: a `glob()` loader with
`base: "./content/projects"` (resolved against the project root, not `src/`) and
`pattern: "*.md"`, validated against a Zod schema (`title`, `tagline`, `status`, `order`,
`featured`, `links.{live,docs,repo}`, `stack`). `status` is deliberately an open string, not a
closed enum — the four existing project files already use three different values (`"live"`,
`"active"`, `"case-study"`).

### `src/components/`

| Component | Responsibility |
| --- | --- |
| `BaseLayout.astro` | The shared HTML shell: `<head>` with charset/viewport/title/meta description/canonical/Open Graph tags (via `seo.ts`) and favicon, plus `Header`, a `<main>` slot, and `Footer`. Every page renders through this layout. |
| `Header.astro` | Site navigation: Home, Projects, CV, "How this site was built", and a direct "Download CV (PDF)" link to `/andrius-riauba-cv.pdf`. Every link is live. |
| `Footer.astro` | Reads `cvForBuild.basics.email` and the LinkedIn profile (found by matching `network` case-insensitively, after TODO-filtering has already run) to render a `mailto:` link and LinkedIn link, plus `© <current year> <cvForBuild.basics.name>`. |
| `CvContent.astro` | Renders the full CV body (name/label/contact line/profiles/remote line, Summary, Experience, Skills, Education, Languages, Certificates — each section only shown when its underlying list/string is non-empty) from a `Cv` passed in as a prop. Shared, unstyled-by-page-chrome markup used identically by both `/cv` (inside `BaseLayout`) and `/cv/print` (standalone, for the PDF), so the two can never drift apart. Work entries are pre-sorted by the caller via `getWorkReverseChronological`. |
| `ProjectCard.astro` | Renders one project list item (used by the home page's featured list, `/projects` and `/projects/tag/<tag>`): a link to `/projects/<id>`, the `title`, a generic status badge (`project.data.status`, one visual style regardless of the status string), the `tagline`, and each `stack` entry as a link to `/projects/tag/<slugifyTag(tag)>` (spec 003, AC-1/AC-3). |

### `src/pages/`

| Page | Responsibility |
| --- | --- |
| `index.astro` | The home page. Reads `cvForBuild` to render name/label/summary/remote line and profile links (TODO-filtered per `cv.publish.ts`); reads the `projects` collection via `getCollection("projects")` and `getFeaturedProjectsSorted` to render featured projects in `order`. Builds its own short SEO description distinct from the full CV summary. |
| `cv.astro` | The `/cv` page. Renders a "Download CV (PDF)" button linking to `/andrius-riauba-cv.pdf`, then `<CvContent cv={cvForBuild} />`, through the normal `BaseLayout` (full header/footer/nav). Also passes `buildPersonJsonLd(cvForBuild)` to `BaseLayout` as `structuredData`, which serializes it into a `<script type="application/ld+json">` tag via `toSafeJsonLd`. |
| `cv/print.astro` | The print-optimised source for the generated PDF (spec 002, decision #4): a minimal standalone HTML document — no `Header`/`Footer`/nav — rendering the same `<CvContent cv={cvForBuild} />`, with `<meta name="robots" content="noindex">` and a `<link rel="canonical">` pointing back at `/cv` so it is never indexed as a separate page. Imports `src/styles/print.css` in addition to the shared `global.css` for print-specific layout (e.g. page-break control). This is the exact URL `scripts/build-pdf.mjs` loads and prints to PDF; it is not meant to be browsed directly. |
| `projects/index.astro` | The `/projects` catalogue page (spec 003, AC-1): every project from `getCollection("projects")`, sorted via `getAllProjectsSorted`, rendered as `ProjectCard`s. |
| `projects/tag/[tag].astro` | Static `/projects/tag/<tag>` filter pages (spec 003, AC-3): `getStaticPaths()` generates one page per `getAllTagSlugs()` group (`{ slug, label, projects }`), rendering only that group's projects — filtering needs zero client-side JavaScript. |
| `projects/[slug].astro` | The `/projects/<slug>` detail page (spec 003, AC-4/AC-5): `getStaticPaths()` from every collection entry; renders the markdown body via `astro:content`'s `render(entry)` (already TODO-paragraph-stripped in production, per `markdown-todo.ts`), plus a link button per `getVisibleProjectLinks(project.data.links)` entry. |
| `how-this-site-was-built.astro` | The `/how-this-site-was-built` page (spec 003, AC-6): hand-written prose on the spec→plan→implement→test→review→docs pipeline and its two human approval gates, plus a table built from `getSpecIndex()` (number, title, status, PR link when present). |
| `404.astro` | A styled not-found page through the same `BaseLayout`, with a link back to `/`. |

### Styling and fonts

`src/styles/global.css` self-hosts Inter (OFL-licensed, `src/assets/fonts/*.woff2`) in two
subsets per weight (400/600): `latin` and `latin-ext`. `latin-ext` is required, not optional —
`content/cv.yaml` and `content/projects/*.md` contain Lithuanian diacritics (`ų`, `š`, `č`,
`ė`) that the `latin`-only subset doesn't cover. Colour theming uses CSS custom properties
switched by a `prefers-color-scheme: dark` media query; the dark-mode accent (`#60a5fa`) is a
lighter tint of the light-mode accent (`#1d4ed8`), chosen to keep WCAG AA contrast against the
dark background — verified by the axe accessibility e2e suite, not by a separate contrast
checker.

## Configuration

All build-time configuration lives in `astro.config.mjs`:

```js
export default defineConfig({
  site: "https://riauba.org",
  output: "static",
  integrations: [todoParagraphStrippingIntegration()],
});
```

- `site` is the canonical origin used by `seo.ts`'s `buildPageSeo()` to build absolute
  canonical/Open Graph URLs; it is also what `resolveCanonicalUrl` enforces every page's
  canonical URL stays on.
- `output: "static"` — no server-side rendering, no adapter; `astro build` emits static files
  to `dist/`.
- `integrations: [todoParagraphStrippingIntegration()]` — a small inline integration (spec 003,
  not a separate npm package) whose `astro:config:setup` hook sets `markdown.processor:
  satteri({ mdastPlugins: [createSatteriTodoParagraphPlugin({ enabled: command === "build",
  warn: console.warn }) ] })`, gating AC-5's TODO-paragraph stripping on the real CLI command.
  This is an inline integration, rather than the plain object/functional forms `defineConfig`
  might suggest, because Astro's `defineConfig` never invokes a function passed as its default
  export — `astro:config:setup` is the documented way to read `command` — see
  [Markdown body TODO stripping](#markdown-body-todo-stripping-markdown-todots) and
  [ADR-0003](../adr/0003-project-body-todo-stripping.md)'s Addendum.

There are no environment variables consumed by the Astro build itself today. `make deploy` and
`make smoke` (see below) read deployment-time shell variables (`DEPLOY_USER`, `DEPLOY_HOST`,
`DEPLOY_PATH`, `ENV`), but actual deployment is out of scope until spec 004 — `make deploy`
exists in the `Makefile` already but there is nothing deploy-specific in the app code yet.

## API reference

There is no HTTP API and no OpenAPI spec — riauba.org is a static content site with no
backend. The closest things to a schema contract are the two content schemas documented above
(`src/lib/cv.schema.ts` and the `projectSchema` in `src/content.config.ts`), which fully define
the shape of `content/cv.yaml` and `content/projects/*.md`.

## Runbook

### Build, test and lint commands

Run from the repository root:

| Command | What it does |
| --- | --- |
| `make setup` | `npm ci`, then installs the Playwright Chromium browser. |
| `make test` | Runs Vitest unit tests (`tests/unit/`) against `src/lib/` and the content schemas. |
| `make lint` | `astro check` (TypeScript/Astro type checking) + `eslint` + `prettier --check`. |
| `make format` | `prettier --write .` |
| `make build` | `npm run build` (`astro build` → `dist/`) then `npm run build:pdf`. |
| `make e2e` | Runs `make build` first, then the Playwright e2e suite (`tests/e2e/`), including `@axe-core/playwright` accessibility scans. |
| `make screenshots` | Opt-in only — builds the site and regenerates `docs/user-guide/img/*.png` via a separate Playwright config (`playwright.screenshots.config.ts`). Not part of `make e2e` or CI because it overwrites tracked screenshots. |
| `make security` | `npm audit --audit-level=high`. |
| `make docs` | Builds this documentation site with `mkdocs build --strict` (fails on any warning). |

CI (`.github/workflows/ci.yml`) runs, on every pull request and push to `main`: `make setup`,
`make lint`, `make test`, `make security`, `make docs`, then `make e2e` (which depends on
`make build`), with the Playwright browser cache keyed on `package-lock.json`.

### The `build:pdf` step

`npm run build:pdf` runs `scripts/build-pdf.mjs`, which generates the real, downloadable
`dist/andrius-riauba-cv.pdf` by printing the `/cv/print` route with a headless Chromium driven
by `playwright-core`. It replaces spec 001's no-op stub (`scripts/build-pdf-stub.mjs`, deleted).
Full rationale and alternatives considered are in
[ADR-0002](../adr/0002-pdf-generation-approach.md); the mechanics:

1. `astro build` only produces static files in `dist/` — nothing serves them over HTTP, and
   `page.goto()` needs a URL. So the script first spawns the project's own `npm run preview`
   as a child process on a dedicated port (`4323`, distinct from the e2e suite's `4321` so the
   two never collide even run back to back).
2. It polls that server with `fetch` every 250ms until it responds, with a bounded 30s
   timeout. Per this project's "fail loudly" convention, a server that never becomes ready
   throws a descriptive error and exits non-zero rather than hanging `make build` forever.
3. Once ready, it launches `chromium` (from `playwright-core`, pinned to the same version as
   the `playwright`/`@playwright/test` dependency already used by the e2e suite — see ADR-0002
   decision 2), navigates to `/cv/print`, waits for `document.fonts.ready` so printed text
   isn't rendered with a fallback font, and calls `page.pdf({ path: "dist/andrius-riauba-cv.pdf",
   format: "A4", printBackground: true })`.
4. The preview server and browser are always torn down in a `finally` block, regardless of
   whether printing succeeded. The server is started with `detached: true`, making it the
   leader of its own OS process group, and is stopped by signalling that whole group
   (`process.kill(-pid, "SIGTERM")`, falling back to `SIGKILL` after a 5s grace period) rather
   than just the immediate child PID. This is deliberately more than a plain `child.kill()`:
   manual QA surfaced that killing only the immediate `npm` process could leave the actual
   `astro preview` process it had spawned running and holding port 4323, because some npm
   versions replace the immediate child via `exec()` into a different process rather than
   keeping it around as the thing that owns the listening socket — a plain, non-group kill
   then has nothing left to signal, and the server survives to orphan the next run. Killing
   the negative PID (the whole process group) reaches it either way.

### Common failures

- **Build fails with "Invalid content/cv.yaml: ... "** — `content/cv.yaml` doesn't match the
  schema in `src/lib/cv.schema.ts` (e.g. a required field is missing or has the wrong type).
  The error lists every failing field path; fix `content/cv.yaml` and rebuild.
- **Build fails with a content-collection schema error mentioning `content/projects/...`** —
  one of the markdown files' frontmatter doesn't match `projectSchema` in
  `src/content.config.ts` (e.g. `order` is a string instead of a number, or `featured` is
  missing). Fix the frontmatter and rebuild.
- **`make docs` fails with a strict mkdocs warning** — usually a broken internal link or a
  heading referenced by the nav that doesn't exist; `mkdocs build --strict` turns every warning
  into a build failure by design.
- **Build fails with `getAllTagSlugs: tags "..." and "..." both slugify to "..."`** — two
  distinct stack tags across `content/projects/*.md` collapse to the same `/projects/tag/<slug>`
  route (e.g. two spellings of the same technology). Rename one of them so they slugify
  differently.
- **Build fails with `getAllTagSlugs: tag "..." ... slugifies to an empty string`** — a stack
  tag is made up entirely of non-alphanumeric characters (e.g. just punctuation), so it has no
  usable route segment. Rename the tag to include at least one letter or digit.
- **`build:pdf` fails with "preview server ... did not become ready within 30000ms"** —
  something is already bound to port 4323 (a leftover `astro preview` process from a prior
  interrupted `build-pdf.mjs` run is the usual cause), or `astro build` didn't run first so
  `dist/` is missing/stale. Free the port (or reboot the shell) and rerun `make build`.

### Adding a new project (developer-facing mechanics)

See the user guide's ["How to add a new
project"](../user-guide/index.md#how-to-add-a-new-project) for the content-authoring steps.
Mechanically: any new file dropped into `content/projects/*.md` with valid frontmatter is
picked up automatically by the `glob()` loader on the next build — no code change is needed to
register a new project.

There is no deploy or rollback runbook yet: hosting, deployment and rollback are spec 004's
scope (not built on this branch). `make deploy` and `make smoke` targets exist in the
`Makefile` already, in anticipation of that spec, but there is no deployment pipeline wired up
today.
