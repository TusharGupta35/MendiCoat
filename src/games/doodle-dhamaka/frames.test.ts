import { describe, expect, it } from 'vitest';
import { frameScheduler } from './frames';

/** A hand-cranked stand-in for requestAnimationFrame. */
function fakeFrames() {
  const queued = new Map<number, () => void>();
  let next = 1;
  return {
    request: (callback: () => void) => {
      queued.set(next, callback);
      return next++;
    },
    cancel: (id: number) => {
      queued.delete(id);
    },
    run() {
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback());
    },
    get size() {
      return queued.size;
    },
  };
}

describe('painting the canvas', () => {
  it('paints once for many changes in the same frame', () => {
    const frames = fakeFrames();
    let paints = 0;
    const scheduler = frameScheduler(() => (paints += 1), frames.request, frames.cancel);
    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    frames.run();
    expect(paints).toBe(1);
  });

  it('still paints after a cancel — the bug that hid every new line', () => {
    const frames = fakeFrames();
    let paints = 0;
    const scheduler = frameScheduler(() => (paints += 1), frames.request, frames.cancel);

    // What React's development mode does: mount, unmount mid-frame, mount again.
    scheduler.schedule();
    scheduler.cancel();
    scheduler.schedule();

    expect(frames.size).toBe(1);
    frames.run();
    expect(paints).toBe(1);
  });

  it('uses the newest paint function for a frame already queued', () => {
    const frames = fakeFrames();
    const painted: string[] = [];
    const scheduler = frameScheduler(() => painted.push('old'), frames.request, frames.cancel);
    scheduler.schedule();
    scheduler.setPaint(() => painted.push('new'));
    frames.run();
    expect(painted).toEqual(['new']);
  });
});
