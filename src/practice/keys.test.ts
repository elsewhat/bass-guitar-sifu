import { describe, expect, it } from 'vitest';
import { keyAction } from './keys';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean }> = {}) =>
  keyAction({ key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...mods });

describe('keyAction', () => {
  it('maps the transport keys', () => {
    expect(key(' ')).toBe('toggle');
    expect(key('ArrowLeft')).toBe('prev');
    expect(key('ArrowRight')).toBe('next');
    expect(['+', '='].map((k) => key(k))).toEqual(['faster', 'faster']);
    expect(['-', '_'].map((k) => key(k))).toEqual(['slower', 'slower']);
  });

  it('scrolls the lyrics with the up and down arrows, also when held', () => {
    expect(key('ArrowUp')).toBe('lyricsUp');
    expect(key('ArrowDown', { repeat: true })).toBe('lyricsDown');
  });

  it('ignores other keys and modifier combinations', () => {
    expect(key('k')).toBeNull();
    expect(key('ArrowUp', { ctrlKey: true })).toBeNull();
    expect(key(' ', { ctrlKey: true })).toBeNull();
    expect(key('+', { metaKey: true })).toBeNull();
    expect(key('ArrowRight', { altKey: true })).toBeNull();
  });

  it('ignores a held Space but repeats arrows and tempo', () => {
    expect(key(' ', { repeat: true })).toBeNull();
    expect(key('ArrowRight', { repeat: true })).toBe('next');
    expect(key('-', { repeat: true })).toBe('slower');
  });
});
