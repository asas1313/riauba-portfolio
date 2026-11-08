// Matches the placeholder marker as a whole word only, case-sensitively, so
// "TODO: ask about dates" matches but "Kristodoras" and "todo" do not
// (spec 002, decision #2). Shared by every TODO-handling mechanism in the
// codebase (cv.publish.ts's field stripping, project-links.ts's link
// filter, markdown-todo.ts's paragraph stripper) so the matching rule can
// never quietly drift between them.
export const TODO_PATTERN = /\bTODO\b/;

/**
 * Whole-word, case-sensitive TODO check for a single string value. `null`
 * and `undefined` are never considered TODO-marked.
 */
export function isTodoMarked(value: string | null | undefined): boolean {
  if (value == null) return false;
  return TODO_PATTERN.test(value);
}
