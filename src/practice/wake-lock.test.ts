import { describe, expect, it } from 'vitest';
import { keepAwakeWhilePlaying, type VisibilitySource, type WakeLockApi, type WakeLockHandle } from './wake-lock';

class FakeLock implements WakeLockHandle {
  released = false;
  private listeners: (() => void)[] = [];
  async release() {
    if (this.released) return;
    this.released = true;
    for (const l of this.listeners) l();
  }
  addEventListener(_type: 'release', listener: () => void) {
    this.listeners.push(listener);
  }
}

function setup() {
  let playing = false;
  let changed = () => {};
  const locks: FakeLock[] = [];
  const api: WakeLockApi = {
    request: async () => {
      const l = new FakeLock();
      locks.push(l);
      return l;
    },
  };
  let onVisibility = () => {};
  const page: VisibilitySource & { visibilityState: DocumentVisibilityState } = {
    visibilityState: 'visible',
    addEventListener: (_type, l) => void (onVisibility = l),
  };
  keepAwakeWhilePlaying(() => playing, (l) => void (changed = l), api, page);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    locks,
    held: () => locks.filter((l) => !l.released).length,
    async play(p: boolean) {
      playing = p;
      changed();
      await flush();
    },
    async visibility(state: DocumentVisibilityState, browserReleases = true) {
      page.visibilityState = state;
      if (state === 'hidden' && browserReleases) for (const l of locks) await l.release();
      onVisibility();
      await flush();
    },
  };
}

describe('keepAwakeWhilePlaying', () => {
  it('holds one lock while playing and releases it on pause', async () => {
    const s = setup();
    expect(s.locks).toHaveLength(0);
    await s.play(true);
    await s.play(true);
    expect(s.locks).toHaveLength(1);
    expect(s.held()).toBe(1);
    await s.play(false);
    expect(s.held()).toBe(0);
  });

  it('requests the lock again when the page is visible again and still playing', async () => {
    const s = setup();
    await s.play(true);
    await s.visibility('hidden');
    expect(s.held()).toBe(0);
    await s.visibility('visible');
    expect(s.locks).toHaveLength(2);
    expect(s.held()).toBe(1);
  });

  it('does not request it when the page becomes visible while paused', async () => {
    const s = setup();
    await s.play(true);
    await s.play(false);
    await s.visibility('hidden');
    await s.visibility('visible');
    expect(s.locks).toHaveLength(1);
  });

  it('releases a lock that arrives after playback has stopped', async () => {
    const s = setup();
    const pending = s.play(true);
    await s.play(false);
    await pending;
    expect(s.locks).toHaveLength(1);
    expect(s.held()).toBe(0);
  });

  it('does nothing without the API', () => {
    expect(() => keepAwakeWhilePlaying(() => true, () => {}, undefined, undefined)).not.toThrow();
  });
});
