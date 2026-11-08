import { isTodoMarked } from "./todo.ts";

export type ProjectLinkKind = "live" | "docs" | "repo";

export interface ProjectLinks {
  live: string | null;
  docs: string | null;
  repo: string | null;
}

export interface VisibleProjectLink {
  kind: ProjectLinkKind;
  label: string;
  url: string;
}

const LINK_ORDER: { kind: ProjectLinkKind; label: string }[] = [
  { kind: "live", label: "Live" },
  { kind: "docs", label: "Docs" },
  { kind: "repo", label: "Repo" },
];

/**
 * Returns the ordered (live, docs, repo) link buttons a project detail page
 * should render, dropping any link whose value is `null` or TODO-marked
 * (AC-4). Unlike AC-5's markdown-body TODO stripping, this filter is
 * unconditional — identical in `astro dev` and `astro build` — since a
 * link button that literally reads "TODO" would otherwise be visible
 * (and clickable, pointing nowhere useful) in local development.
 */
export function getVisibleProjectLinks(
  links: ProjectLinks,
): VisibleProjectLink[] {
  return LINK_ORDER.flatMap(({ kind, label }) => {
    const url = links[kind];
    if (url === null || isTodoMarked(url)) return [];
    return [{ kind, label, url }];
  });
}
