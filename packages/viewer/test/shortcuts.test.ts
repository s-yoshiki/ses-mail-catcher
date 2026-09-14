import { describe, expect, it } from 'vitest';

import { mapKeyToAction } from '../src/shortcuts.js';
import type { ShortcutKeyContext } from '../src/shortcuts.js';

const context = (overrides: Partial<ShortcutKeyContext> & Pick<ShortcutKeyContext, 'key'>): ShortcutKeyContext => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  targetTag: '',
  isContentEditable: false,
  isSearchField: false,
  ...overrides,
});

describe('mapKeyToAction', () => {
  it('maps every documented shortcut key', () => {
    expect(mapKeyToAction(context({ key: 'j' }))).toBe('next');
    expect(mapKeyToAction(context({ key: 'k' }))).toBe('previous');
    expect(mapKeyToAction(context({ key: '/' }))).toBe('focus-search');
    expect(mapKeyToAction(context({ key: 'r' }))).toBe('refresh');
    expect(mapKeyToAction(context({ key: 'Delete' }))).toBe('delete');
    expect(mapKeyToAction(context({ key: 'Escape' }))).toBe('home');
    expect(mapKeyToAction(context({ key: '?' }))).toBe('help');
  });

  it('ignores unmapped keys', () => {
    expect(mapKeyToAction(context({ key: 'x' }))).toBeUndefined();
    expect(mapKeyToAction(context({ key: 'Enter' }))).toBeUndefined();
  });

  it('ignores every key held with Ctrl, Meta, or Alt', () => {
    expect(mapKeyToAction(context({ key: 'j', ctrlKey: true }))).toBeUndefined();
    expect(mapKeyToAction(context({ key: 'r', metaKey: true }))).toBeUndefined();
    expect(mapKeyToAction(context({ key: '/', altKey: true }))).toBeUndefined();
  });

  it('ignores keys typed into a text field, textarea, or contenteditable element', () => {
    expect(mapKeyToAction(context({ key: 'j', targetTag: 'INPUT' }))).toBeUndefined();
    expect(mapKeyToAction(context({ key: 'r', targetTag: 'TEXTAREA' }))).toBeUndefined();
    expect(mapKeyToAction(context({ key: 'k', isContentEditable: true }))).toBeUndefined();
  });

  it('clears the search only for Escape on the search field itself', () => {
    expect(mapKeyToAction(context({ key: 'Escape', targetTag: 'INPUT', isSearchField: true }))).toBe('clear-search');
    expect(mapKeyToAction(context({ key: 'Escape', targetTag: 'INPUT', isSearchField: false }))).toBeUndefined();
    expect(mapKeyToAction(context({ key: 'Escape', targetTag: 'TEXTAREA', isSearchField: true }))).toBe('clear-search');
  });

  it('still goes home for Escape outside any text field', () => {
    expect(mapKeyToAction(context({ key: 'Escape' }))).toBe('home');
  });
});
