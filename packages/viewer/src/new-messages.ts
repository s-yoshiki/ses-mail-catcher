/**
 * The ids present in `currentIds` that are not in `knownIds`, used to mark
 * messages that arrived after the list was first loaded. Pure set diff: it
 * does not decide when a marker is cleared (that happens once the message
 * is selected, tracked separately as UI state).
 */
export const diffNewIds = (knownIds: ReadonlySet<string>, currentIds: readonly string[]): Set<string> => {
  const result = new Set<string>();
  for (const id of currentIds) {
    if (!knownIds.has(id)) {
      result.add(id);
    }
  }
  return result;
};
