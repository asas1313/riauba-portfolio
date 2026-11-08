import { describe, expect, it, vi } from "vitest";
import {
  countTopLevelTodoParagraphsInMarkdownBody,
  createSatteriTodoParagraphPlugin,
  isTodoParagraph,
  remarkStripTodoParagraphs,
  removeTodoParagraphs,
  stripFrontmatter,
  warnAboutTodoParagraphsInFiles,
  type MdastRootLike,
} from "../../src/lib/markdown-todo.ts";

function paragraph(text: string) {
  return { type: "paragraph", children: [{ type: "text", value: text }] };
}

function boldTodoParagraph(rest: string) {
  return {
    type: "paragraph",
    children: [
      { type: "strong", children: [{ type: "text", value: "TODO" }] },
      { type: "text", value: rest },
    ],
  };
}

function heading(text: string) {
  return { type: "heading", children: [{ type: "text", value: text }] };
}

describe("isTodoParagraph (AC-5)", () => {
  it("matches a paragraph whose joined text starts with the whole word TODO", () => {
    expect(isTodoParagraph(paragraph("TODO: fill this in"))).toBe(true);
  });

  it("matches a paragraph starting with a bold TODO run (recursively-joined text)", () => {
    expect(isTodoParagraph(boldTodoParagraph(" (Andrius): fill this in"))).toBe(
      true,
    );
  });

  it("does not match a paragraph that merely contains TODO later in the sentence", () => {
    expect(isTodoParagraph(paragraph("Ask Andrius about the TODO list"))).toBe(
      false,
    );
  });

  it("does not match a non-paragraph node (e.g. a heading)", () => {
    expect(isTodoParagraph(heading("TODO"))).toBe(false);
  });

  it("does not match lowercase todo or a substring like Kristodoras", () => {
    expect(isTodoParagraph(paragraph("todo: lowercase"))).toBe(false);
    expect(isTodoParagraph(paragraph("Kristodoras works here"))).toBe(false);
  });
});

describe("removeTodoParagraphs (AC-5)", () => {
  it("removes a single top-level TODO paragraph and returns a count of 1", () => {
    const tree: MdastRootLike = {
      type: "root",
      children: [paragraph("Intro."), paragraph("TODO: fill this in")],
    };
    const removed = removeTodoParagraphs(tree);
    expect(removed).toBe(1);
    expect(tree.children).toEqual([paragraph("Intro.")]);
  });

  it("removes multiple top-level TODO paragraphs", () => {
    const tree: MdastRootLike = {
      type: "root",
      children: [
        paragraph("TODO: one"),
        paragraph("Kept."),
        paragraph("TODO: two"),
      ],
    };
    const removed = removeTodoParagraphs(tree);
    expect(removed).toBe(2);
    expect(tree.children).toEqual([paragraph("Kept.")]);
  });

  it("leaves non-paragraph top-level nodes untouched", () => {
    const tree: MdastRootLike = {
      type: "root",
      children: [heading("TODO"), paragraph("Kept.")],
    };
    const removed = removeTodoParagraphs(tree);
    expect(removed).toBe(0);
    expect(tree.children).toEqual([heading("TODO"), paragraph("Kept.")]);
  });

  it("conservatively keeps a TODO paragraph nested inside a list item (top-level-only scope)", () => {
    const nestedTodoList = {
      type: "list",
      children: [
        {
          type: "listItem",
          children: [paragraph("TODO: nested, out of scope")],
        },
      ],
    };
    const tree: MdastRootLike = {
      type: "root",
      children: [nestedTodoList],
    };
    const removed = removeTodoParagraphs(tree);
    expect(removed).toBe(0);
    expect(tree.children).toEqual([nestedTodoList]);
  });

  it("is a no-op on a tree with no TODO paragraphs", () => {
    const tree: MdastRootLike = {
      type: "root",
      children: [paragraph("A"), paragraph("B")],
    };
    expect(removeTodoParagraphs(tree)).toBe(0);
    expect(tree.children).toEqual([paragraph("A"), paragraph("B")]);
  });
});

describe("remarkStripTodoParagraphs", () => {
  it("is a no-op when enabled is false, even against a TODO fixture", () => {
    const warn = vi.fn();
    const transform = remarkStripTodoParagraphs({ enabled: false, warn });
    const tree: MdastRootLike = {
      type: "root",
      children: [paragraph("TODO: fill this in")],
    };
    transform(tree, { path: "content/projects/example.md" });
    expect(tree.children).toEqual([paragraph("TODO: fill this in")]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("calls warn exactly once with a count when enabled and something was removed", () => {
    const warn = vi.fn();
    const transform = remarkStripTodoParagraphs({ enabled: true, warn });
    const tree: MdastRootLike = {
      type: "root",
      children: [
        paragraph("Kept."),
        paragraph("TODO: one"),
        paragraph("TODO: two"),
      ],
    };
    transform(tree, { path: "content/projects/example.md" });
    expect(tree.children).toEqual([paragraph("Kept.")]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("2");
    expect(warn.mock.calls[0][0]).toContain("content/projects/example.md");
  });

  it("does not call warn at all when enabled but nothing matched", () => {
    const warn = vi.fn();
    const transform = remarkStripTodoParagraphs({ enabled: true, warn });
    const tree: MdastRootLike = {
      type: "root",
      children: [paragraph("Kept.")],
    };
    transform(tree, { path: "content/projects/example.md" });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("createSatteriTodoParagraphPlugin", () => {
  function fakeContext(fileURL?: URL) {
    const removed: unknown[] = [];
    return {
      removed,
      fileURL,
      textContent(node: { children?: { value?: string }[]; value?: string }) {
        if (typeof node.value === "string") return node.value;
        return (node.children ?? [])
          .map((child) => (typeof child.value === "string" ? child.value : ""))
          .join("");
      },
      removeNode(node: unknown) {
        removed.push(node);
      },
    };
  }

  it("is a no-op when enabled is false", () => {
    const warn = vi.fn();
    const plugin = createSatteriTodoParagraphPlugin({ enabled: false, warn });
    const ctx = fakeContext();
    const root = { children: [paragraph("TODO: fill this in")] };
    plugin.before(root, ctx);
    expect(ctx.removed).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("removes top-level TODO paragraphs via context.removeNode and warns once with the file path", () => {
    const warn = vi.fn();
    const plugin = createSatteriTodoParagraphPlugin({ enabled: true, warn });
    const fileURL = new URL("file:///repo/content/projects/atsidek.md");
    const ctx = fakeContext(fileURL);
    const todoNode = paragraph("TODO: fill this in");
    const root = { children: [paragraph("Kept."), todoNode] };
    plugin.before(root, ctx);
    expect(ctx.removed).toEqual([todoNode]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("1");
    expect(warn.mock.calls[0][0]).toContain("atsidek.md");
  });

  it("does not call warn when nothing matched", () => {
    const warn = vi.fn();
    const plugin = createSatteriTodoParagraphPlugin({ enabled: true, warn });
    const ctx = fakeContext(
      new URL("file:///repo/content/projects/homelab.md"),
    );
    const root = { children: [paragraph("Kept.")] };
    plugin.before(root, ctx);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("stripFrontmatter", () => {
  it("removes a leading YAML frontmatter block", () => {
    const raw = "---\ntitle: X\nstatus: live\n---\nBody text.\n";
    expect(stripFrontmatter(raw)).toBe("Body text.\n");
  });

  it("is a no-op when there is no frontmatter delimiter", () => {
    expect(stripFrontmatter("Just a body.\n")).toBe("Just a body.\n");
  });
});

describe("countTopLevelTodoParagraphsInMarkdownBody (AC-5, cache-independent path)", () => {
  it("counts a single plain top-level TODO paragraph", () => {
    const body = "Intro paragraph.\n\nTODO (Andrius): fill this in.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(1);
  });

  it("counts multiple top-level TODO paragraphs", () => {
    const body = "TODO: one.\n\nKept.\n\nTODO: two.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(2);
  });

  it("counts a TODO paragraph starting with a bold run", () => {
    const body = "**TODO** (Andrius): fill this in.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(1);
  });

  it("counts a TODO paragraph starting with a markdown link label", () => {
    const body = "[TODO](https://example.com) fill this in.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(1);
  });

  it("does not count a paragraph that merely contains TODO later in the sentence", () => {
    const body = "Ask Andrius about the TODO list.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(0);
  });

  it("does not count lowercase todo or a substring like Kristodoras", () => {
    const body = "todo: lowercase.\n\nKristodoras works here.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(0);
  });

  it("does not count a TODO heading", () => {
    expect(countTopLevelTodoParagraphsInMarkdownBody("## TODO\n")).toBe(0);
  });

  it("does not count a TODO paragraph nested inside a list item (top-level-only scope)", () => {
    const body = "- TODO: nested, out of scope.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(0);
  });

  it("does not count a TODO paragraph nested inside a blockquote", () => {
    const body = "> TODO: nested, out of scope.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(0);
  });

  it("does not count TODO text inside a fenced code block", () => {
    const body = "```\nTODO: just an example in code, not a real todo.\n```\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(0);
  });

  it("is a no-op on a body with no TODO paragraphs", () => {
    const body = "Intro.\n\nMore text.\n";
    expect(countTopLevelTodoParagraphsInMarkdownBody(body)).toBe(0);
  });
});

describe("warnAboutTodoParagraphsInFiles (AC-5, cache-independent path)", () => {
  it("warns once per affected file, naming the path and the count", () => {
    const warn = vi.fn();
    warnAboutTodoParagraphsInFiles({
      files: [
        {
          path: "content/projects/atsidek.md",
          rawSource: "---\ntitle: X\n---\nTODO: one.\n",
        },
        {
          path: "content/projects/homelab.md",
          rawSource: "---\ntitle: Y\n---\nKept, no TODO here.\n",
        },
      ],
      warn,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("1");
    expect(warn.mock.calls[0][0]).toContain("content/projects/atsidek.md");
  });

  it("does not warn at all when no file has a TODO paragraph", () => {
    const warn = vi.fn();
    warnAboutTodoParagraphsInFiles({
      files: [{ path: "content/projects/homelab.md", rawSource: "Kept.\n" }],
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("is independent of any render/content-layer cache: calling it repeatedly against the same unchanged input warns every time", () => {
    const warn = vi.fn();
    const files = [
      { path: "content/projects/atsidek.md", rawSource: "TODO: one.\n" },
    ];
    warnAboutTodoParagraphsInFiles({ files, warn });
    warnAboutTodoParagraphsInFiles({ files, warn });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
