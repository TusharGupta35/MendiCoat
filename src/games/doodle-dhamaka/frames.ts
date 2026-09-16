/**
 * Paints at most once per frame, however many changes arrive in it.
 *
 * Its own module, rather than a few lines in the canvas, because getting it
 * wrong is silent: the drawing simply stops appearing. The canvas once
 * cancelled a pending frame without forgetting it, and from then on every
 * request was dropped as "already scheduled" — so it is kept small enough to
 * test on its own.
 */
export function frameScheduler(
  paint: () => void,
  request: (callback: () => void) => number = (callback) => requestAnimationFrame(callback),
  cancelFrame: (id: number) => void = (id) => cancelAnimationFrame(id),
) {
  let pending: number | null = null;
  let latestPaint = paint;

  return {
    /** Swap in a newer paint function without losing a frame already queued. */
    setPaint(next: () => void) {
      latestPaint = next;
    },
    schedule() {
      if (pending !== null) return;
      pending = request(() => {
        pending = null;
        latestPaint();
      });
    },
    cancel() {
      if (pending !== null) cancelFrame(pending);
      pending = null;
    },
  };
}
