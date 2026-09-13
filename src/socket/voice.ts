import type { Server } from 'socket.io';

/**
 * Voice chat signalling, for every table in the app.
 *
 * The server only relays the WebRTC handshake between peers; the audio streams
 * themselves flow directly browser-to-browser and never pass through here.
 *
 * This sits with the socket server rather than inside a game, because none of
 * it is about cards. It needs exactly two things from whichever game a socket
 * is playing — `socket.data.roomCode` and `socket.data.name` — and every game
 * module sets both when a player sits down. So a new game gets voice by
 * existing, not by implementing anything.
 */
export function registerVoiceRelay(io: Server) {
  io.on('connection', (socket) => {
    const voiceRoomOf = (roomCode: string) => `voice:${roomCode}`;

    socket.on('voice-join', async ({ roomCode }: { roomCode: string }) => {
      // Only somebody actually sitting in this room may join its voice channel.
      if (socket.data.roomCode !== roomCode) return;
      const voiceRoom = voiceRoomOf(roomCode);
      const existing = await io.in(voiceRoom).fetchSockets();
      const peers = existing
        .filter((peer) => peer.id !== socket.id)
        .map((peer) => ({ peerId: peer.id, name: (peer.data.name as string) ?? 'Player' }));

      socket.join(voiceRoom);
      // The newcomer receives the existing peers and initiates offers to them.
      socket.emit('voice-peers', peers);
      socket.to(voiceRoom).emit('voice-peer-joined', {
        peerId: socket.id,
        name: (socket.data.name as string) ?? 'Player',
      });
    });

    socket.on('voice-signal', ({ to, data }: { to: string; data: unknown }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (!roomCode) return;
      // Only relay between two sockets that both share this room's voice channel.
      const members = io.sockets.adapter.rooms.get(voiceRoomOf(roomCode));
      if (!members?.has(socket.id) || !members.has(to)) return;
      io.to(to).emit('voice-signal', { from: socket.id, data });
    });

    socket.on('voice-leave', ({ roomCode }: { roomCode: string }) => {
      const voiceRoom = voiceRoomOf(roomCode);
      socket.leave(voiceRoom);
      socket.to(voiceRoom).emit('voice-peer-left', { peerId: socket.id });
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (!roomCode) return;
      // A dropped connection has to close its peers' side of the call, or every
      // remaining browser holds an audio element that will never speak again.
      socket.to(voiceRoomOf(roomCode)).emit('voice-peer-left', { peerId: socket.id });
    });
  });
}
