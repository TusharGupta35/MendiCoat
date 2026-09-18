import type { ComponentType } from 'react';
import { GameInstructions } from '@/games/mendi-coat/Instructions';
import { SocketRoomClient } from '@/games/mendi-coat/RoomClient';
import { DoodleInstructions } from '@/games/doodle-dhamaka/Instructions';
import { DoodleRoomClient } from '@/games/doodle-dhamaka/RoomClient';
import { ImpostorInstructions } from '@/games/impostor/Instructions';
import { ImpostorRoomClient } from '@/games/impostor/RoomClient';
import { TigdiInstructions } from '@/games/teen-ki-tigdi/Instructions';
import { TigdiRoomClient } from '@/games/teen-ki-tigdi/RoomClient';

/**
 * The pages each game brings: the table itself, and the card that explains it.
 *
 * `module.ts` is the server's list of games and this is the browser's. They are
 * kept apart because the socket server must never import a React component, and
 * a page must never import a socket handler.
 *
 * The room page and the game page look a game up here instead of asking which
 * game it is, so adding one does not mean editing either of them.
 */

export interface RoomClientProps {
  roomCode: string;
  playerId: string;
  playerName: string;
  playerAvatar: string | null;
  playerTitle: string | null;
}

interface GameUi {
  RoomClient: ComponentType<RoomClientProps>;
  Instructions: ComponentType;
}

const UI: Record<string, GameUi> = {
  MENDI_COAT: { RoomClient: SocketRoomClient, Instructions: GameInstructions },
  TEEN_KI_TIGDI: { RoomClient: TigdiRoomClient, Instructions: TigdiInstructions },
  DOODLE_DHAMAKA: { RoomClient: DoodleRoomClient, Instructions: DoodleInstructions },
  IMPOSTOR: { RoomClient: ImpostorRoomClient, Instructions: ImpostorInstructions },
};

/** A game's pages, falling back to Mendi Coat's for a room that predates game ids. */
export const uiFor = (gameId: string): GameUi => UI[gameId] ?? UI.MENDI_COAT;
