import { markdownToMdast } from "satteri";

// Spec 003, AC-5: omit any top-level markdown body paragraph starting with
// the whole word "TODO" from production builds, warning once per affected
// file — the same marker and whole-word/case-sensitive rule as
// src/lib/todo.ts, applied to a markdown AST instead of a parsed object
// tree. See ADR-0003 for why this has to run as a plugin registered on the
// Markdown processor (at content-sync render time) rather than by mutating
// a collection entry's raw body before rendering.
//
// Deviation from ADR-0003's original wording (see the ADR's Addendum):
// Astro 7.4 (the version this repo pins) ships Sätteri, not the classic
// unified/remark pipeline, as its *default* Markdown processor, and
// `markdown.remarkPlugins` throws a config-validation error unless
// `@astrojs/markdown-remark` is installed separately. `removeTodoParagraphs`
// and `remarkStripTodoParagraphs` below are still a faithful, plain-mdast
// implementation of the ADR's algorithm (and are what astro.config.mjs would
// use if this project ever configured `markdown.processor: unified(...)`
// instead); the real production wiring in astro.config.mjs instead goes
// through `createSatteriTodoParagraphPlugin`, targeting Sätteri's own native
// mdast-plugin shape.

/** Minimal, duck-typed shape covering every mdast node this module reads:
 * a `type` discriminator, an optional leaf `value` (text/inlineCode/html
 * nodes), and an optional `children` array (every other node). */
interface TextLikeNode {
  type: string;
  value?: string;
  children?: TextLikeNode[];
}

export interface MdastRootLike {
  type: "root";
  children: TextLikeNode[];
}

const TODO_PARAGRAPH_PATTERN = /^TODO\b/;

/** Recursively joins every descendant text node's `.value`, depth-first,
 * across all inline children — so a leading `**TODO**` bold run or a
 * `TODO` at the start of a leading link's label is caught too, not just a
 * bare leading `text` node. */
function joinNodeText(node: TextLikeNode): string {
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(joinNodeText).join("");
}

/**
 * True when `node` is a `paragraph` whose plain text (by default, computed
 * via `joinNodeText`; a caller operating on a real mdast implementation may
 * pass its own `getText`, e.g. Sätteri's `context.textContent`) matches
 * `/^TODO\b/` (case-sensitive, whole-word — AC-5's "starting with TODO",
 * narrower than spec 002's "TODO anywhere").
 */
export function isTodoParagraph(
  node: TextLikeNode,
  getText: (node: TextLikeNode) => string = joinNodeText,
): boolean {
  return (
    node.type === "paragraph" && TODO_PARAGRAPH_PATTERN.test(getText(node))
  );
}

/**
 * Removes every *top-level* (direct child of `tree`) paragraph matching
 * `isTodoParagraph`, mutating `tree.children` in place. Returns the number
 * of paragraphs removed. Scope is deliberately limited to top-level
 * paragraphs — a TODO paragraph nested inside a list item or blockquote is
 * left untouched (see ADR-0003's documented limitation).
 */
export function removeTodoParagraphs(tree: MdastRootLike): number {
  const kept = tree.children.filter((node) => !isTodoParagraph(node));
  const removedCount = tree.children.length - kept.length;
  tree.children = kept;
  return removedCount;
}

interface VFileLike {
  path?: string;
}

export interface RemarkStripTodoParagraphsOptions {
  enabled: boolean;
  warn: (message: string) => void;
}

/**
 * A standard unified "attacher" (`() => (tree, file) => { ... }`) wrapping
 * `removeTodoParagraphs`: a no-op unless `enabled`, and calls `warn` once
 * per file (naming the file path and the count) when at least one
 * paragraph was removed. This is the shape ADR-0003 originally specified
 * for `astro.config.mjs`'s `markdown.remarkPlugins` — kept as a faithful,
 * independently-testable implementation of the algorithm even though the
 * real build wiring below targets Sätteri instead (see this file's header
 * comment).
 */
export function remarkStripTodoParagraphs({
  enabled,
  warn,
}: RemarkStripTodoParagraphsOptions) {
  return (tree: MdastRootLike, file?: VFileLike) => {
    if (!enabled) return;
    const removed = removeTodoParagraphs(tree);
    if (removed === 0) return;
    const path = file?.path ?? "unknown file";
    warn(
      `markdown-todo: omitted ${removed} TODO-marked paragraph(s) from ${path}`,
    );
  };
}

/** The subset of Sätteri's `MdastVisitorContext` (see `satteri`'s
 * `mdast-visitor.d.ts`) that `createSatteriTodoParagraphPlugin` needs. */
interface SatteriMdastPluginContext {
  textContent(node: TextLikeNode): string;
  removeNode(node: TextLikeNode): void;
  fileURL: URL | undefined;
}

interface SatteriMdastRootLike {
  children: TextLikeNode[];
}

export interface SatteriTodoParagraphPluginOptions {
  enabled: boolean;
  warn: (message: string) => void;
  /**
   * Invoked with the number of top-level TODO paragraphs removed from this
   * document (zero when none), right before `warn`. Lets a caller outside
   * Astro's content-layer render — namely
   * `countTopLevelTodoParagraphsInMarkdownBody`/`warnAboutTodoParagraphsInFiles`
   * below, driving the cache-independent `astro:build:start` warning — read
   * back exactly the count this plugin itself computed, by running this
   * same plugin through `satteri`'s standalone `markdownToMdast`, instead
   * of re-implementing or re-parsing anything. This is what guarantees the
   * build-start warning and the real stripping can never disagree (see the
   * "Cache-independent warning" section below for the full history,
   * including review 2's BLOCKER: an earlier, independent text-level
   * approximation here *could* disagree with this plugin, and did, on a
   * loose-list lazy continuation and a setext heading).
   */
  onRemoved?: (count: number) => void;
}

/**
 * Wires `isTodoParagraph` into Astro's actual default Markdown processor
 * (Sätteri — see astro.config.mjs) as a native mdast plugin: a `before`
 * hook (runs once per document, before Sätteri's own visitors) that finds
 * every top-level TODO paragraph and removes it via `context.removeNode`
 * (Sätteri's mdast nodes are read-only; there is no `tree.children` array
 * to reassign, unlike the plain-object `removeTodoParagraphs` above).
 * Warns once per affected file, naming the file path and the count, same
 * as `remarkStripTodoParagraphs`.
 */
export function createSatteriTodoParagraphPlugin({
  enabled,
  warn,
  onRemoved,
}: SatteriTodoParagraphPluginOptions) {
  return {
    name: "strip-todo-paragraphs",
    before(root: SatteriMdastRootLike, context: SatteriMdastPluginContext) {
      if (!enabled) return;
      const todoParagraphs = root.children.filter((node) =>
        isTodoParagraph(node, (n) => context.textContent(n)),
      );
      for (const node of todoParagraphs) context.removeNode(node);
      onRemoved?.(todoParagraphs.length);
      if (todoParagraphs.length === 0) return;
      const path = context.fileURL ? context.fileURL.pathname : "unknown file";
      warn(
        `markdown-todo: omitted ${todoParagraphs.length} TODO-marked paragraph(s) from ${path}`,
      );
    },
  };
}

// --- Cache-independent warning (fixes a real bug found in review 1) -------
//
// `createSatteriTodoParagraphPlugin`'s `before` hook above only ever runs
// as part of Astro's content-layer render step, driven from
// `node_modules/astro/dist/content/loaders/glob.js`'s `syncData`. That
// function short-circuits re-rendering (and therefore skips invoking any
// Sätteri mdast plugin, including this one) whenever a file's on-disk
// content digest matches the digest already recorded for it in the
// content-layer cache (`existingEntry.digest === digest`) — a correct
// optimisation for the *rendered HTML*, which doesn't need to change, but
// wrong for a side-effecting build warning: a second `astro build` run
// against an unchanged, warm `.astro`/`node_modules/.astro` cache (e.g.
// `make build` immediately followed by `make e2e`) never re-invokes the
// plugin's `before` hook at all, so the warning silently stops firing even
// though the content still has (and still correctly ships, stripped of)
// the TODO paragraph. Empirically confirmed: two consecutive `astro build`
// runs with a warm cache only warn on neither/first run depending on prior
// cache state, never reliably on every run.
//
// Fix: warn from a point in the build pipeline that always runs once per
// `astro build`, completely independent of Astro's content-layer cache —
// scanning `content/projects/*.md` directly off disk. See astro.config.mjs,
// which calls `warnAboutTodoParagraphsInFiles` from the `astro:build:start`
// integration hook (which fires unconditionally, every build, before any
// content-layer sync/caching happens at all). The Sätteri plugin above
// keeps stripping the paragraphs from rendered HTML (still required, and
// still correct even when the cache skips re-rendering, since a previously
// cached `entry.rendered` was itself already correctly stripped the first
// time) — only the *warning* responsibility moves here, to avoid firing
// twice on a cold cache and zero times on a warm one.
//
// Review 2's BLOCKER: this cache-independent count used to be computed by a
// bespoke, dependency-free text-level block splitter (split raw source on
// blank lines, classify each block's first line with a hand-written
// "is this the start of a non-paragraph block" regex). That is a *second*,
// independently-maintained approximation of "is this a top-level TODO
// paragraph" alongside `isTodoParagraph`/`createSatteriTodoParagraphPlugin`
// above — and it disagreed with the real mdast parse on at least two
// CommonMark shapes the splitter's regex couldn't recognise: a lazy
// continuation line of a loose list item indented only to the list marker's
// content column (2-3 spaces, below the splitter's `\s{4,}` indented-code-
// block threshold — misread as a new top-level paragraph, not still part of
// the list item), and a `TODO ...\n===` setext heading (misread as a
// paragraph; mdast correctly parses it as a heading). Both caused a false-
// positive "omitted a TODO paragraph" warning while the literal TODO text
// still shipped to production HTML untouched — violating the very property
// this mechanism exists to guarantee.
//
// Fix: delete the bespoke splitter entirely. `countTopLevelTodoParagraphsInMarkdownBody`
// below now parses the body with the exact same mdast parser
// (`satteri`'s `markdownToMdast`, the same native parser Astro's
// `satteri()` Markdown processor uses) and runs it through the *literal
// same* `createSatteriTodoParagraphPlugin` that performs the real
// stripping, reading back its `onRemoved` count. There is now exactly one
// piece of logic that decides "is this a top-level TODO paragraph" — the
// warning and the actual strip can no longer drift apart.

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Strips a single leading YAML frontmatter block (`---\n...\n---`), if
 * present, from a markdown file's raw source. A no-op if the source has no
 * frontmatter delimiter at all. */
export function stripFrontmatter(rawSource: string): string {
  return rawSource.replace(FRONTMATTER_PATTERN, "");
}

/**
 * Counts top-level TODO paragraphs in a markdown file body (frontmatter
 * already stripped), for the cache-independent `astro:build:start` warning.
 * Parses `body` with `satteri`'s `markdownToMdast` — the same native mdast
 * parser Astro's real `satteri()` Markdown processor uses — and runs the
 * result through `createSatteriTodoParagraphPlugin` itself (the same
 * plugin that performs the real stripping at render time), reading back
 * the count via `onRemoved` instead of re-implementing or approximating
 * the matching logic. This guarantees the count can never disagree with
 * what the real plugin would strip from the same source.
 */
export function countTopLevelTodoParagraphsInMarkdownBody(
  body: string,
): number {
  let removedCount = 0;
  markdownToMdast(body, {
    mdastPlugins: [
      createSatteriTodoParagraphPlugin({
        enabled: true,
        warn: () => {},
        onRemoved: (count) => {
          removedCount = count;
        },
      }),
    ],
  });
  return removedCount;
}

export interface TodoParagraphFile {
  /** Path to report in the warning message (kept as given — callers pass
   * whatever path shape matches `createSatteriTodoParagraphPlugin`'s
   * `context.fileURL.pathname`-derived messages, for consistent output). */
  path: string;
  /** Raw file source, frontmatter included — stripped internally. */
  rawSource: string;
}

export interface WarnAboutTodoParagraphsInFilesOptions {
  files: readonly TodoParagraphFile[];
  warn: (message: string) => void;
}

/**
 * Cache-independent counterpart to `createSatteriTodoParagraphPlugin`'s
 * warning (see the header comment above for why this exists): warns once
 * per file, in the same message shape, for every given file that has at
 * least one top-level TODO paragraph. Intended to be called once per
 * `astro build`, directly against `content/projects/*.md` on disk, from
 * the `astro:build:start` integration hook in astro.config.mjs — a hook
 * that always runs on every build, regardless of content-layer cache
 * state.
 */
export function warnAboutTodoParagraphsInFiles({
  files,
  warn,
}: WarnAboutTodoParagraphsInFilesOptions): void {
  for (const { path, rawSource } of files) {
    const count = countTopLevelTodoParagraphsInMarkdownBody(
      stripFrontmatter(rawSource),
    );
    if (count === 0) continue;
    warn(
      `markdown-todo: omitted ${count} TODO-marked paragraph(s) from ${path}`,
    );
  }
}
