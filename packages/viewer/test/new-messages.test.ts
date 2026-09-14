import { describe, expect, it } from 'vitest';

import { diffNewIds } from '../src/new-messages.js';

describe('diffNewIds', () => {
  it('returns ids that are not in the known set', () => {
    const result = diffNewIds(new Set(['a', 'b']), ['a', 'b', 'c', 'd']);
    expect(result).toEqual(new Set(['c', 'd']));
  });

  it('returns an empty set when nothing is new', () => {
    expect(diffNewIds(new Set(['a', 'b']), ['a', 'b']).size).toBe(0);
  });

  it('treats an empty known set as everything being new', () => {
    expect(diffNewIds(new Set(), ['a', 'b'])).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set for an empty current list', () => {
    expect(diffNewIds(new Set(['a']), []).size).toBe(0);
  });
});
