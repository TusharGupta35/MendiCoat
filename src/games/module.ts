import type { Server } from 'socket.io';
import { closeMendiCoatRoom, registerMendiCoatHandlers } from '@/games/mendi-coat/socket';
import { closeTigdiRoom, registerTigdiHandlers } from '@/games/teen-ki-tigdi/socket';
import { closeDoodleRoom, registerDoodleHandlers } from '@/games/doodle-dhamaka/socket';
import { closeImpostorRoom, registerImpostorHandlers } from '@/games/impostor/socket';

/**
 * What a game has to offer the platform to be playable.
 *
 * The catalogue in `registry.ts` says what a game *is* — its name, its blurb,
 * its tile. This says what it *does*: the socket events it answers, and how to
 * forget a room when the host deletes it. Everything else about a game — its
 * rules, its bots, its state, its wire format — stays inside its own folder and
 * is nobody else's business.
 *
 * Adding a game is a folder under `src/games/`, an entry in the catalogue, and
 * a line in the list below.
 */
export interface GameModule {
  /** Matches the `id` of the catalogue entry in registry.ts. */
  id: string;
  /**
   * Attach this game's socket listeners. Called once as the server starts.
   *
   * Every game shares one socket connection, so each must namespace its
   * events — Teen Ki Tigdi prefixes its own with `tigdi:`, Doodle Dhamaka with
   * `doodle:`. Mendi Coat's unprefixed names were here first and are left alone.
   */
  register: (io: Server) => void;
  /**
   * Drop a room's live state. Called for every game when any room is deleted,
   * because a room code says nothing about which game was being played in it —
   * so this must be a no-op for a code the game never held.
   */
  closeRoom: (code: string) => void;
  /**
   * The event this game's page listens for to learn its room was deleted, so
   * the socket server can tell every page without knowing any game's names.
   */
  closedEvent: string;
}

export const GAME_MODULES: GameModule[] = [
  {
    id: 'MENDI_COAT',
    register: registerMendiCoatHandlers,
    closeRoom: closeMendiCoatRoom,
    closedEvent: 'room-closed',
  },
  {
    id: 'TEEN_KI_TIGDI',
    register: registerTigdiHandlers,
    closeRoom: closeTigdiRoom,
    closedEvent: 'tigdi:closed',
  },
  {
    id: 'DOODLE_DHAMAKA',
    register: registerDoodleHandlers,
    closeRoom: closeDoodleRoom,
    closedEvent: 'doodle:closed',
  },
  {
    id: 'IMPOSTOR',
    register: registerImpostorHandlers,
    closeRoom: closeImpostorRoom,
    closedEvent: 'imp:closed',
  },
];
