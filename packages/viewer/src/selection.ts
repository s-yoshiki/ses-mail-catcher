/**
 * The message to select next, in `ids` order, once `currentId` is removed:
 * the id that follows it, else the one before it, else `undefined` (no
 * message left to select). Used to navigate away from a message before it
 * is deleted, so its detail query is never refetched into a 404 flash.
 */
export const nextSelectionAfterRemoval = (ids: string[], currentId: string): string | undefined => {
  const index = ids.indexOf(currentId);
  if (index === -1) {
    return undefined;
  }
  if (index + 1 < ids.length) {
    return ids[index + 1];
  }
  if (index - 1 >= 0) {
    return ids[index - 1];
  }
  return undefined;
};

/**
 * Moves the selection by `direction` (+1 for next, -1 for previous) within
 * `ids`, without wrapping. Starting from no selection picks the first item
 * (moving forward) or the last (moving backward). At either boundary the
 * current id is returned unchanged.
 */
export const adjacentSelection = (
  ids: string[],
  currentId: string | undefined,
  direction: 1 | -1,
): string | undefined => {
  if (ids.length === 0) {
    return undefined;
  }

  if (currentId === undefined) {
    return direction === 1 ? ids[0] : ids.at(-1);
  }

  const index = ids.indexOf(currentId);
  if (index === -1) {
    return direction === 1 ? ids[0] : ids.at(-1);
  }

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= ids.length) {
    return currentId;
  }
  return ids[nextIndex];
};
