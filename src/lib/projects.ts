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
