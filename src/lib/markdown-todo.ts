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
}: SatteriTodoParagraphPluginOptions) {
  return {
    name: "strip-todo-paragraphs",
    before(root: SatteriMdastRootLike, context: SatteriMdastPluginContext) {
      if (!enabled) return;
      const todoParagraphs = root.children.filter((node) =>
        isTodoParagraph(node, (n) => context.textContent(n)),
      );
      if (todoParagraphs.length === 0) return;
      for (const node of todoParagraphs) context.removeNode(node);
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

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Strips a single leading YAML frontmatter block (`---\n...\n---`), if
 * present, from a markdown file's raw source. A no-op if the source has no
 * frontmatter delimiter at all. */
export function stripFrontmatter(rawSource: string): string {
  return rawSource.replace(FRONTMATTER_PATTERN, "");
}

/** Matches the *first line* of a blank-line-delimited block that marks it
 * as something other than a plain paragraph: an ATX heading, blockquote,
 * fenced code block, list item (bulleted or ordered), thematic break, or
 * indented code block. Kept deliberately simple (no full CommonMark block
 * parser) since this only has to decide *whether to warn*, not what to
 * strip — `createSatteriTodoParagraphPlugin`'s mdast-based check remains
 * the sole source of truth for the actual build output. */
const NON_PARAGRAPH_BLOCK_START =
  /^(#{1,6}(\s|$)|>|```|~~~|[-*+]\s|\d+[.)]\s|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$|\s{4,}\S)/;

/**
 * A dependency-free, text-level approximation of "top-level TODO
 * paragraph" detection (see the header comment above), operating directly
 * on a markdown file body's raw source instead of an mdast tree: blocks
 * are split on blank lines, lines inside a fenced code block are never
 * treated as their own blocks, and a kept block counts as a TODO paragraph
 * if, after stripping any leading non-alphanumeric characters (so a
 * leading `**TODO**`, `` `TODO` `` or `[TODO](url)` is still caught,
 * mirroring `isTodoParagraph`'s recursively-joined-text behaviour), its
 * text matches `/^TODO\b/`.
 */
export function countTopLevelTodoParagraphsInMarkdownBody(
  body: string,
): number {
  const lines = body.split("\n");
  let count = 0;
  let inFence = false;
  let fenceMarker = "";
  let blockLines: string[] = [];
  let blockExcluded = false;

  function flush() {
    if (blockLines.length === 0) return;
    if (!blockExcluded) {
      const text = blockLines.join(" ").trim();
      const stripped = text.replace(/^[^A-Za-z0-9]+/, "");
      if (/^TODO\b/.test(stripped)) count++;
    }
    blockLines = [];
    blockExcluded = false;
  }

  for (const line of lines) {
    const fenceMatch = /^(```|~~~)/.exec(line);
    if (fenceMatch && !inFence) {
      flush();
      inFence = true;
      fenceMarker = fenceMatch[1];
      blockExcluded = true;
      blockLines.push(line);
      continue;
    }
    if (fenceMatch && inFence && fenceMatch[1] === fenceMarker) {
      blockLines.push(line);
      flush();
      inFence = false;
      continue;
    }
    if (inFence) {
      blockLines.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (blockLines.length === 0) {
      blockExcluded = NON_PARAGRAPH_BLOCK_START.test(line);
    }
    blockLines.push(line);
  }
  flush();
  return count;
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
