/**
 * A way for Next.js request handlers to reach the live socket rooms.
 *
 * Both halves run in the same process (see server.ts), but Next.js compiles
 * route handlers into its own module registry, so a module-level value in
 * src/socket/server.ts is not the same object the route would import. The one
 * thing they genuinely share is globalThis — the same reason src/lib/prisma.ts
 * keeps its client there.
 */
type CloseRoom = (code: string) => void;

const registry = globalThis as unknown as { __closeSocketRoom?: CloseRoom };

/** Called once by the socket server as it starts. */
export function registerCloseRoom(close: CloseRoom) {
  registry.__closeSocketRoom = close;
}

/**
 * Tears down a room's live state and turns out anyone still sitting in it.
 * A no-op if the socket server has not registered yet, which is the right
 * outcome: with no live rooms there is nothing to tear down.
 */
export function closeSocketRoom(code: string) {
  registry.__closeSocketRoom?.(code);
}
