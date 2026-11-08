# ADR-0003: Stripping TODO paragraphs from project markdown bodies via a remark plugin

Status: Accepted · Date: 2026-11-08

## Context

Spec 003's AC-5 requires that any paragraph in a `content/projects/*.md` body starting with the
literal word `TODO` is omitted from the production build and reported as a warning — "the same
mechanism as spec 002" (`src/lib/cv.publish.ts`'s whole-word, case-sensitive, prod-only TODO
stripping for `content/cv.yaml`).

`cv.publish.ts`'s mechanism operates on a parsed, in-memory JS object (`cv`): it walks the tree,
finds string leaves matching `/\bTODO\b/`, and deletes/nulls fields before any page ever reads
`cvForBuild`. The equivalent naive approach for a project body — mutate `entry.body` (the raw
markdown string) before rendering — does not work for Astro content collections. Inspecting
`node_modules/astro/dist/content/loaders/glob.js` and `vite-plugin-content-imports.js` (Astro
7.4, the version this repo pins) shows that for a `glob()`-loaded markdown entry, `astro build`'s
content-layer sync step renders the body to HTML **once, eagerly, at sync time**, via the
collection's registered `getRenderFunction`, and stores the result as `entry.rendered.html` /
`entry.rendered.metadata` in the content store. `astro:content`'s `render(entry)` helper
(`node_modules/astro/dist/content/runtime.js`) returns a `<Content />` component built from that
*cached* `entry.rendered`, not from `entry.body` at call time. So a page that mutated
`entry.body` right before calling `render(entry)` would have no effect — the HTML was already
produced earlier, from the original, unmodified file.

## Decision

Strip TODO paragraphs during that one eager render step itself, via a **remark plugin**
registered in `astro.config.mjs`'s `markdown.remarkPlugins`. This is the standard, documented
extension point for that exact render step (it is the same pipeline that would process
`src/pages/*.md` if any existed, and the same one Astro's built-in markdown content-entry type
uses internally) — not a new or unusual mechanism, just one not previously needed by this
codebase.

Concretely:

- `src/lib/markdown-todo.ts` exports a pure, dependency-free function
  `removeTodoParagraphs(tree)` that walks an mdast root's direct children, and for each top-level
  `paragraph` node computes its **recursively-joined plain text** — concatenating the `.value` of
  every descendant `text` node, depth-first, across all of the paragraph's inline children (so a
  leading `**TODO**` bold run, or `TODO` at the start of a leading link's label, is caught, not
  just a bare leading `text` node) — and removes the paragraph if that joined text matches
  `/^TODO\b/` (case-sensitive, whole-word — matching AC-5's "paragraphs starting with TODO", a
  narrower rule than spec 002's "TODO anywhere in the field"). Returns the number of paragraphs
  removed. Scope is deliberately limited to *top-level* paragraphs — direct children of the
  document root — not a full-tree visitor: a `TODO`-starting paragraph nested inside a list item
  or blockquote is left untouched. No AST-walking library (e.g. `unist-util-visit`) is added as a
  dependency for either part — the inline-text join is a small recursive helper over mdast's plain
  `.children` arrays, and the top-level-only paragraph scan is a single `.filter()` pass.
- The same file exports `remarkStripTodoParagraphs({ enabled, warn })`, a standard unified
  "attacher" (`() => (tree, file) => { ... }`) that calls `removeTodoParagraphs` only when
  `enabled` is true, and calls `warn(message)` (once per file, naming the file path and the
  count) when at least one paragraph was removed.
- `astro.config.mjs` switches to the functional `defineConfig(({ command }) => ({ ... }))` form
  so it can pass `enabled: command === "build"` — mirroring `cv.publish.ts`'s
  `import.meta.env.PROD` gating (TODOs render as-is in `astro dev`, are stripped in `astro
  build`), using the config-time equivalent since `import.meta.env` isn't meaningful inside
  `astro.config.mjs` itself.

## Alternatives considered

- **Mutate `entry.body` before calling `render(entry)` in the page.** Rejected: does not work,
  per the Context section above — `entry.rendered` is cached before any page-level code runs.
- **Post-process `entry.rendered.html` (the compiled HTML string) with a regex/string stripper
  in the page**, e.g. removing `<p>TODO ...</p>` blocks. Rejected: fragile by construction — it
  has to re-derive paragraph boundaries from HTML tag soup (and cope with any inline markup
  Astro's markdown pipeline emits inside the paragraph) instead of working on the already
  well-structured mdast tree the renderer itself uses; a future change to how paragraphs are
  escaped or wrapped would silently break the regex instead of a type error.
- **A custom Astro content loader** wrapping `glob()` that preprocesses each file's raw text
  (string-level paragraph splitting, closer to `cv.publish.ts`'s string/field-oriented style)
  before handing it to the default markdown render pipeline. Rejected: more code than a remark
  plugin for the same result, and it would reimplement paragraph-boundary detection in plain
  strings (blank-line splitting) that the markdown parser already does correctly as part of
  producing the mdast tree, including edge cases like paragraphs inside list items or blockquotes
  (which, per AC-5's plain "paragraphs starting with TODO" wording, are intentionally *not* in
  scope here — only top-level body paragraphs are — but a string-splitting reimplementation would
  have had to actively exclude those, where operating on top-level mdast children does so for
  free).

## Consequences

- Two different TODO-handling code paths now exist in the codebase: `cv.publish.ts`'s
  whole-field, schema-aware stripping for `content/cv.yaml`/JS objects, and
  `markdown-todo.ts`'s whole-paragraph, mdast-aware stripping for `content/projects/*.md` bodies.
  They share the "whole-word, case-sensitive `TODO`, prod-build-only" policy and the
  warn-on-strip behaviour, but not code, because they operate on different data shapes (a typed
  object tree vs. a markdown AST) at different times (page-render time vs. content-sync time).
  This asymmetry should be documented in `docs/technical/index.md` so a future contributor
  doesn't go looking for a single shared "stripTodo" function that covers both.
- The warning is emitted once per affected **file**, during content sync (which happens once
  per `astro build`, and incrementally in `astro dev`), not once per build via a single
  aggregated message like `cv.publish.ts`'s `getPublishableCv`. This is simpler but means N
  stripped project files produce N separate `console.warn` lines rather than one summary.
- `astro.config.mjs` moves from the plain-object `defineConfig({...})` form to the functional
  `defineConfig(({ command }) => ({...}))` form to access `command`. This is a supported,
  documented Astro API, not a workaround.
- Only `content/projects/*.md` is rendered through Astro's markdown pipeline today, so a
  site-wide `remarkPlugins` entry only ever affects project bodies in practice; if a future spec
  adds other Astro-rendered markdown (e.g. `src/pages/*.md`), this plugin would apply there too
  and should be revisited.
- Because the render happens at content-sync time and is cached as `entry.rendered`, a stale
  on-disk content-layer cache (`.astro/`) is a plausible failure mode: running `astro dev`
  (populating the cache under `enabled: false`), then `astro build` without clearing `.astro/`,
  could in principle serve cached, un-stripped HTML instead of re-rendering with `enabled: true`.
  This was verified empirically as part of shipping spec 003 (see its plan, amendment 8) rather
  than assumed safe; if it ever regresses, the fix is to bust/ignore the content-layer cache when
  the Markdown processor's config changes, not to document around it.

## Addendum (2026-11-08, during spec 003 implementation): Sätteri, not `remarkPlugins`

The Decision section above, as originally written, specified registering
`remarkStripTodoParagraphs` via `astro.config.mjs`'s `markdown.remarkPlugins`. Empirically running
`astro build` with `markdown.remarkPlugins` configured against this repo's actual pinned Astro
version (`astro@7.4.7`) throws a config-validation error:

```
`markdown.remarkPlugins`, `markdown.rehypePlugins`, and `markdown.remarkRehype` run on the
`unified` processor from `@astrojs/markdown-remark`, which is no longer installed by default
now that Sätteri is the default Markdown processor. Install it with:
  npm install @astrojs/markdown-remark
```

Astro 7.4 ships **Sätteri**, a new native (Rust/NAPI-backed) Markdown processor, as the *default*
`markdown.processor` — not the classic `unified`/`remark`/`rehype` pipeline most Astro
documentation (and this ADR's original Decision/Alternatives sections) assumes. The classic
pipeline still exists, but only as the separate, optional `@astrojs/markdown-remark` package,
which this project does not install (and installing it would mean maintaining two parallel
Markdown engines for no reason, and is exactly the kind of avoidable new dependency the project's
"no new dependency" conventions exist to prevent).

Resolution: `src/lib/markdown-todo.ts` keeps `removeTodoParagraphs`/`remarkStripTodoParagraphs`
exactly as originally designed — a faithful, independently unit-testable implementation of the
"top-level paragraph, recursively-joined text, `/^TODO\b/`" algorithm, operating on a plain mdast
tree shape, usable unchanged if this project ever configures `markdown.processor: unified(...)`
instead. The real, production wiring instead goes through a second export,
`createSatteriTodoParagraphPlugin`, targeting **Sätteri's own native mdast-plugin shape**: a
`before(root, context)` hook (Sätteri's equivalent of a unified transformer, run once per
document before Sätteri's built-in visitors) that identifies top-level TODO paragraphs using the
same `isTodoParagraph` predicate (reused as-is — Sätteri's mdast nodes reuse the standard `mdast`
package's node *types*, just exposed read-only) and removes each one via `context.removeNode(node)`
instead of reassigning `tree.children` (Sätteri's tree is immutable from plugin code; all mutation
goes through side-channel context methods). `astro.config.mjs` registers this via Astro's own
documented configuration point for Sätteri plugins: `markdown.processor: satteri({ mdastPlugins:
[...] })`, importing `satteri` from `@astrojs/markdown-satteri`.

`@astrojs/markdown-satteri` is added to `package.json`'s `devDependencies`, pinned to the exact
version already resolved as part of installing `astro` itself (`astro`'s own default Markdown
engine — not a new third party package, and not adding any new runtime capability beyond what a
bare `npm install astro` already requires). It is listed explicitly only because `astro.config.mjs`
needs to `import { satteri } from "@astrojs/markdown-satteri"` directly, per Astro's own documented
`markdown.processor` configuration pattern (relying on it resolving only as an undeclared
transitive dependency of `astro` would work today but is fragile/implicit).

This was caught by actually running `astro build` with the plugin wired in, not just by reading
`node_modules/astro/dist/content/loaders/glob.js` (which is still accurate regarding `entry.rendered`
caching — that reasoning is unaffected by which Markdown processor renders the body). The lesson:
when an ADR's Decision depends on a specific third-party library's configuration surface, verify
it against the project's actually-pinned version of that library, not just its documented API
shape in general.

A second, independent gap surfaced the same way: this ADR's original Decision also assumed
`astro.config.mjs` could use a *functional* `defineConfig(({ command }) => ({ ... }))` form
(mirroring Vite's `defineConfig`) to read the current CLI command. Astro's own `defineConfig`
(`node_modules/astro/dist/config/index.js`) is a plain identity function —
`defineConfig(config) { return config; }` — and does **not** support a callback form at all;
passing a function as the config's default export means that function is simply never called
(empirically confirmed by adding a `console.error` inside it and observing it never print, in
multiple fresh-cache builds). The documented, supported way to read `command` and mutate config in
response is an integration's `astro:config:setup` hook, which receives both `command` and
`updateConfig`. `astro.config.mjs` therefore defines a small inline integration (no new package)
that calls `updateConfig({ markdown: { processor: satteri({ mdastPlugins: [...] }) } })` from
inside that hook, gating `enabled: command === "build"` there instead.

**Amendment-8 verification (performed empirically, not assumed):** with the fix above in place,
three scenarios were exercised end-to-end against the real `content/projects/atsidek.md` and
`payments-migration.md` (both of which have a real `TODO (Andrius): ...` top-level paragraph):

1. A completely fresh content-layer cache (both `.astro/` and `node_modules/.astro/` removed),
   `astro build` run directly: the build log shows `markdown-todo: omitted 1 TODO-marked
   paragraph(s) from .../atsidek.md` (and the same for `payments-migration.md`), and the built
   `dist/projects/atsidek/index.html` / `dist/projects/payments-migration/index.html` contain no
   `TODO` text anywhere.
2. From that same fresh cache, `astro dev` started, fetched via `fetch("http://localhost:.../
   projects/atsidek/")` (confirms a real HTTP response, not just a static file check), stopped
   (`astro dev stop`) — the dev response **does** contain the literal `TODO` paragraph, confirming
   `enabled: command === "build"` correctly leaves TODOs visible in dev.
3. The specific risk amendment 8 names: starting from a *fresh* cache again, running `astro dev`
   first (confirmed via `fetch` to serve the un-stripped TODO paragraph), stopping it, then running
   `astro build` immediately afterwards **without** clearing `.astro/` or `node_modules/.astro/` in
   between. Result: the build log still shows both `markdown-todo: omitted ...` warnings, and the
   built HTML still has no `TODO` text — the dev warm-up's cache entries did not leak un-stripped
   HTML into the subsequent production build. No cache-busting fix was needed; the risk named in
   amendment 8 did not materialize in practice for this codebase's actual usage pattern (every
   markdown file is fully re-rendered through the still-synchronous `getRenderFunction`/`render`
   call path on each `astro build`/`astro dev` invocation observed here, rather than silently
   reusing a cross-command persisted `rendered.html`). If a future Astro version changes this
   caching behaviour, re-run this same three-scenario check before assuming it still holds.
