import { describe, expect, it } from 'vitest';

import { adjacentSelection, nextSelectionAfterRemoval } from '../src/selection.js';

describe('nextSelectionAfterRemoval', () => {
  it('selects the following id when one exists', () => {
    expect(nextSelectionAfterRemoval(['a', 'b', 'c'], 'b')).toBe('c');
  });

  it('falls back to the previous id when removing the last one', () => {
    expect(nextSelectionAfterRemoval(['a', 'b', 'c'], 'c')).toBe('b');
  });

  it('returns undefined when the removed id was the only one', () => {
    expect(nextSelectionAfterRemoval(['a'], 'a')).toBeUndefined();
  });

  it('returns undefined when the id is not in the list', () => {
    expect(nextSelectionAfterRemoval(['a', 'b'], 'z')).toBeUndefined();
  });
});

describe('adjacentSelection', () => {
  it('moves to the next and previous id', () => {
    expect(adjacentSelection(['a', 'b', 'c'], 'b', 1)).toBe('c');
    expect(adjacentSelection(['a', 'b', 'c'], 'b', -1)).toBe('a');
  });

  it('does not wrap past either end', () => {
    expect(adjacentSelection(['a', 'b', 'c'], 'c', 1)).toBe('c');
    expect(adjacentSelection(['a', 'b', 'c'], 'a', -1)).toBe('a');
  });

  it('picks the first or last id when nothing is selected yet', () => {
    expect(adjacentSelection(['a', 'b', 'c'], undefined, 1)).toBe('a');
    expect(adjacentSelection(['a', 'b', 'c'], undefined, -1)).toBe('c');
  });

  it('returns undefined for an empty list', () => {
    expect(adjacentSelection([], undefined, 1)).toBeUndefined();
  });

  it('falls back to the first/last id when the current id is no longer in the list', () => {
    expect(adjacentSelection(['a', 'b'], 'z', 1)).toBe('a');
    expect(adjacentSelection(['a', 'b'], 'z', -1)).toBe('b');
  });
});
