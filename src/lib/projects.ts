import type { CollectionEntry } from "astro:content";

type ProjectEntry = Pick<CollectionEntry<"projects">, "id" | "data">;

/**
 * Keeps only featured projects, sorted by `order` ascending (AC-4).
 */
export function getFeaturedProjectsSorted<T extends ProjectEntry>(
  entries: T[],
): T[] {
  return entries
    .filter((entry) => entry.data.featured)
    .sort((a, b) => a.data.order - b.data.order);
}

/**
 * Every project, sorted by `order` ascending (AC-1) — unlike
 * `getFeaturedProjectsSorted`, non-featured entries are included too.
 */
export function getAllProjectsSorted<T extends ProjectEntry>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => a.data.order - b.data.order);
}

/**
 * Slugifies a stack tag label for use in a `/projects/tag/<slug>` URL:
 * lowercase, every run of non-alphanumeric characters collapsed to a single
 * hyphen, leading/trailing hyphens trimmed. A label made up entirely of
 * non-alphanumeric characters (e.g. "++") slugifies to the empty string —
 * `getAllTagSlugs` treats that as a build-time error rather than a valid
 * (empty) route segment.
 */
export function slugifyTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface TagSlugGroup<T> {
  slug: string;
  label: string;
  projects: T[];
}

/**
 * Groups every project under the slug of each of its `stack` tags (AC-3):
 * one `{ slug, label, projects }` entry per distinct slug, sorted by label,
 * where `label` is the first-seen original spelling of a tag mapping to
 * that slug.
 *
 * Fails loudly (per this project's convention) instead of silently merging
 * or dropping data:
 *
 * - throws if two *distinct* tag labels slugify to the same non-empty
 *   slug (e.g. "Node.js" and "Node JS" would otherwise be silently treated
 *   as one tag);
 * - throws if any label slugifies to the empty string (a punctuation-only
 *   tag like "++" has no usable route segment).
 */
export function getAllTagSlugs<T extends ProjectEntry>(
  entries: T[],
): TagSlugGroup<T>[] {
  const bySlug = new Map<string, { label: string; projects: T[] }>();

  for (const entry of entries) {
    for (const label of entry.data.stack) {
      const slug = slugifyTag(label);

      if (slug === "") {
        throw new Error(
          `getAllTagSlugs: tag "${label}" (on project "${entry.id}") slugifies to an empty string and has no usable /projects/tag/<slug> route. Rename the tag to include at least one letter or digit.`,
        );
      }

      const existing = bySlug.get(slug);
      if (!existing) {
        bySlug.set(slug, { label, projects: [entry] });
        continue;
      }

      if (existing.label !== label) {
        throw new Error(
          `getAllTagSlugs: tags "${existing.label}" and "${label}" both slugify to "${slug}", so they cannot be distinguished as separate /projects/tag/<slug> pages. Rename one of them so they produce different slugs.`,
        );
      }

      existing.projects.push(entry);
    }
  }

  return [...bySlug.entries()]
    .map(([slug, { label, projects }]) => ({ slug, label, projects }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Every project whose `stack` includes a tag slugifying to `slug` (AC-3).
 * Returns an empty array if no project matches (including for an empty
 * `entries` collection).
 */
export function getProjectsByTagSlug<T extends ProjectEntry>(
  entries: T[],
  slug: string,
): T[] {
  return entries.filter((entry) =>
    entry.data.stack.some((tag) => slugifyTag(tag) === slug),
  );
}
