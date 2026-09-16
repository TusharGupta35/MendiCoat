'use client';

import { type PointerEvent, type RefObject, useCallback, useEffect, useRef } from 'react';
import { frameScheduler } from './frames';
import type { DrawOp, Stroke } from './types';

/**
 * The shared canvas.
 *
 * Everything is stored as fractions of the canvas — a point at (0.5, 0.5) is
 * the middle on a phone and the middle on a monitor — and brush widths as
 * thousandths of its width, so a drawing looks the same on every screen it is
 * sent to. The canvas is redrawn from those strokes whenever it changes size,
 * which is also what lets someone arriving mid-round see the whole drawing.
 *
 * The drawer's strokes are drawn locally the instant the pointer moves and sent
 * in small batches, so drawing never feels like it is waiting on the network.
 */

const PAPER = '#fffdf8';
/** How often a batch of points is sent while the pen is moving. */
const FLUSH_MS = 40;
/** Under Vanishing Lines, when a line starts to fade and when it is gone. */
const FADE_FROM_MS = 5_000;
const FADE_OVER_MS = 6_000;

function paint(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  fadeAt: number | null,
) {
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const stroke of strokes) {
    let alpha = 1;
    if (fadeAt !== null) {
      const age = fadeAt - stroke.startedAt - FADE_FROM_MS;
      alpha = age <= 0 ? 1 : Math.max(0, 1 - age / FADE_OVER_MS);
      if (alpha === 0) continue;
    }
    const [first, ...rest] = stroke.points;
    if (!first) continue;
    context.globalAlpha = alpha;
    // An eraser paints the paper back, whatever colour it arrived with.
    const ink = stroke.tool === 'eraser' ? PAPER : stroke.color;
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.lineWidth = Math.max(1, (stroke.size / 1000) * width);

    if (rest.length === 0) {
      // A tap is a dot, not nothing.
      context.beginPath();
      context.arc(first[0] * width, first[1] * height, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.beginPath();
    context.moveTo(first[0] * width, first[1] * height);
    // Smooth through the midpoints, so a fast scribble is a curve, not a zigzag.
    for (let index = 0; index < rest.length - 1; index += 1) {
      const [x, y] = rest[index];
      const [nx, ny] = rest[index + 1];
      context.quadraticCurveTo(x * width, y * height, ((x + nx) / 2) * width, ((y + ny) / 2) * height);
    }
    const last = rest[rest.length - 1];
    context.lineTo(last[0] * width, last[1] * height);
    context.stroke();
  }
  context.globalAlpha = 1;
}

export interface CanvasEffects {
  /** Blind Artist: the drawer sees a blank page. */
  hideFromSelf: boolean;
  /** Mirror Artist: the drawer's own view is mirrored. */
  mirrorSelf: boolean;
  /** Flip: the guessers' view is mirrored. */
  flipped: boolean;
  /** Fog drifting over the guessers' view. */
  fog: boolean;
  /** Vanishing Lines: old strokes fade out. */
  vanishing: boolean;
}

export function DoodleCanvas({
  strokesRef,
  version,
  canDraw,
  tool,
  color,
  size,
  effects,
  serverOffset,
  onOp,
  onStrokeEnd,
}: {
  strokesRef: RefObject<Stroke[]>;
  /** Bumped whenever the strokes change, to repaint. */
  version: number;
  canDraw: boolean;
  tool: 'pen' | 'eraser';
  color: string;
  size: number;
  effects: CanvasEffects;
  /** Server clock minus this browser's, for fading lines on server time. */
  serverOffset: number;
  onOp: (op: DrawOp) => void;
  /** Told when the pen lifts, which is when One Stroke's line is spent. */
  onStrokeEnd?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef<{ id: string; pending: Array<[number, number]>; lastFlush: number } | null>(null);
  const framesRef = useRef<ReturnType<typeof frameScheduler> | null>(null);

  // Kept in a ref, not a dependency. It moves by a few milliseconds with every
  // update from the server, and as a dependency that rebuilt `redraw` — and the
  // resize watcher with it — dozens of times a minute for no reason.
  const offsetRef = useRef(serverOffset);
  offsetRef.current = serverOffset;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    if (effects.hideFromSelf) {
      context.fillStyle = PAPER;
      context.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    paint(
      context,
      strokesRef.current ?? [],
      canvas.width,
      canvas.height,
      effects.vanishing ? Date.now() + offsetRef.current : null,
    );
  }, [effects.hideFromSelf, effects.vanishing, strokesRef]);

  /** Repaints once per frame at most, however many changes arrive in it. */
  framesRef.current ??= frameScheduler(redraw);
  framesRef.current.setPaint(redraw);
  const schedule = useCallback(() => framesRef.current?.schedule(), []);

  // Match the canvas's pixels to its size on screen, sharp on retina displays.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      redraw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => schedule(), [version, schedule]);

  // Fading needs the canvas to keep repainting even when nothing new is drawn.
  useEffect(() => {
    if (!effects.vanishing) return;
    const timer = setInterval(schedule, 100);
    return () => clearInterval(timer);
  }, [effects.vanishing, schedule]);

  // React's development mode mounts every component twice, running this in
  // between — so cancelling has to leave the scheduler able to paint again.
  useEffect(() => () => framesRef.current?.cancel(), []);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
    return [round((event.clientX - rect.left) / rect.width), round((event.clientY - rect.top) / rect.height)];
  };

  const flush = () => {
    const active = activeRef.current;
    if (!active || active.pending.length === 0) return;
    onOp({ kind: 'points', id: active.id, points: active.pending });
    active.pending = [];
    active.lastFlush = Date.now();
  };

  const finish = () => {
    const active = activeRef.current;
    if (!active) return;
    flush();
    onOp({ kind: 'end', id: active.id });
    const stroke = strokesRef.current?.find((entry) => entry.id === active.id);
    if (stroke) stroke.done = true;
    activeRef.current = null;
    onStrokeEnd?.();
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || activeRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const point = pointAt(event);
    const ink = tool === 'eraser' ? '#ffffff' : color;
    strokesRef.current?.push({
      id,
      tool,
      color: ink,
      size,
      points: [point],
      startedAt: Date.now() + offsetRef.current,
      done: false,
    });
    activeRef.current = { id, pending: [], lastFlush: Date.now() };
    onOp({ kind: 'start', id, tool, color: ink, size, point });
    schedule();
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active) return;
    // Coalesced events keep a fast stroke smooth on high-refresh screens.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();
    const stroke = strokesRef.current?.find((entry) => entry.id === active.id);
    for (const moved of events) {
      const point: [number, number] = [
        Math.round(Math.min(1, Math.max(0, (moved.clientX - rect.left) / rect.width)) * 10_000) / 10_000,
        Math.round(Math.min(1, Math.max(0, (moved.clientY - rect.top) / rect.height)) * 10_000) / 10_000,
      ];
      stroke?.points.push(point);
      active.pending.push(point);
    }
    if (Date.now() - active.lastFlush >= FLUSH_MS) flush();
    schedule();
  };

  const mirrored = (effects.mirrorSelf && canDraw) || effects.flipped;

  return (
    <div className="doodle-canvas-surface relative box-border w-full max-w-full overflow-hidden rounded-xl bg-[#fffdf8] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full max-w-full touch-none transition-transform duration-700 ${
          canDraw ? 'cursor-crosshair' : 'cursor-default'
        }`}
        style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label={canDraw ? 'Drawing canvas — draw here' : 'The drawing'}
        role="img"
      />

      {effects.hideFromSelf ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
          <span className="text-5xl">🙈</span>
          <span className="text-sm font-semibold">Blind Artist — keep drawing, they can see it</span>
        </div>
      ) : null}

      {effects.fog ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <span className="doodle-fog left-[-10%] top-[5%] h-[55%] w-[55%]" />
          <span className="doodle-fog doodle-fog-slow right-[-12%] top-[30%] h-[60%] w-[50%]" />
          <span className="doodle-fog doodle-fog-late bottom-[-15%] left-[25%] h-[50%] w-[55%]" />
        </div>
      ) : null}
    </div>
  );
}
