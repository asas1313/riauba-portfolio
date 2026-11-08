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
  /** True for exactly the single highest-priority (live > docs > repo)
   * present link; false for every other present link. Spec 005, decision
   * 4: button-style assignment is by link *type*, not DOM position -- a
   * project missing `live` still gets a primary button, just on `docs`
   * (or `repo` if `docs` is also absent/TODO) instead. */
  isPrimary: boolean;
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
 *
 * The first entry in the returned array (if any) is always `isPrimary`:
 * since `LINK_ORDER` is itself priority order and this filter preserves
 * that order, the first *surviving* entry is always the highest-priority
 * present link, whichever kind it actually is.
 */
export function getVisibleProjectLinks(
  links: ProjectLinks,
): VisibleProjectLink[] {
  const visible = LINK_ORDER.flatMap(({ kind, label }) => {
    const url = links[kind];
    if (url === null || isTodoMarked(url)) return [];
    return [{ kind, label, url }];
  });
  return visible.map((link, index) => ({ ...link, isPrimary: index === 0 }));
}
