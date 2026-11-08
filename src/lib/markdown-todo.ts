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
