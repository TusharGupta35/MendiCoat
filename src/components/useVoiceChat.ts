"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

// Public STUN server so peers can discover their reachable address. This is
// enough for same-LAN or simple NATs; a TURN server would be needed to relay
// audio across stricter/symmetric NATs, but that requires separate hosting.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type VoicePeer = { peerId: string; name: string };
type SignalData = {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export interface VoiceChat {
  micOn: boolean;
  speakerOn: boolean;
  peerCount: number;
  error: string | null;
  toggleMic: () => void;
  toggleSpeaker: () => void;
}

/**
 * Peer-to-peer voice chat over a WebRTC mesh. The passed Socket.IO connection
 * is used only for signalling (offers/answers/ICE candidates); the audio media
 * streams flow directly browser-to-browser and never reach the game server.
 */
export function useVoiceChat(
  socket: Socket | null,
  roomCode: string,
): VoiceChat {
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(socket);
  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  );
  const joined = useRef(false);
  // Read inside async signalling callbacks, which would otherwise close over
  // stale state values.
  const micOnRef = useRef(false);
  const speakerOnRef = useRef(false);

  socketRef.current = socket;

  const removePeer = useCallback((peerId: string) => {
    peers.current.get(peerId)?.close();
    peers.current.delete(peerId);
    const el = audioEls.current.get(peerId);
    if (el) {
      el.srcObject = null;
      el.remove();
      audioEls.current.delete(peerId);
    }
    pendingCandidates.current.delete(peerId);
    setPeerCount(peers.current.size);
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      localStream.current
        ?.getTracks()
        .forEach((track) => pc.addTrack(track, localStream.current!));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("voice-signal", {
            to: peerId,
            data: { candidate: event.candidate },
          });
        }
      };

      pc.ontrack = (event) => {
        let el = audioEls.current.get(peerId);
        if (!el) {
          el = document.createElement("audio");
          el.autoplay = true;
          el.setAttribute("playsinline", "true");
          audioEls.current.set(peerId, el);
          document.body.appendChild(el);
        }
        el.srcObject = event.streams[0];
        el.muted = !speakerOnRef.current;
        void el.play().catch(() => undefined);
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          removePeer(peerId);
        }
      };

      peers.current.set(peerId, pc);
      setPeerCount(peers.current.size);
      return pc;
    },
    [removePeer],
  );

  // The newcomer always initiates toward each existing peer, so exactly one
  // side of every pair creates the offer — avoiding negotiation glare.
  const callPeer = useCallback(
    async (peerId: string) => {
      const pc = createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("voice-signal", {
        to: peerId,
        data: { sdp: pc.localDescription },
      });
    },
    [createPeerConnection],
  );

  const flushCandidates = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      const queued = pendingCandidates.current.get(peerId);
      if (!queued) return;
      pendingCandidates.current.delete(peerId);
      for (const candidate of queued) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
    },
    [],
  );

  const handleSignal = useCallback(
    async ({ from, data }: { from: string; data: SignalData }) => {
      if (data.sdp) {
        let pc = peers.current.get(from);
        if (data.sdp.type === "offer") {
          if (!pc) pc = createPeerConnection(from);
          await pc.setRemoteDescription(data.sdp);
          await flushCandidates(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current?.emit("voice-signal", {
            to: from,
            data: { sdp: pc.localDescription },
          });
        } else if (data.sdp.type === "answer" && pc) {
          await pc.setRemoteDescription(data.sdp);
          await flushCandidates(from, pc);
        }
      } else if (data.candidate) {
        const pc = peers.current.get(from);
        // Candidates can arrive before the remote description is set; queue
        // them until it is, then flush.
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(data.candidate).catch(() => undefined);
        } else {
          const queued = pendingCandidates.current.get(from) ?? [];
          queued.push(data.candidate);
          pendingCandidates.current.set(from, queued);
        }
      }
    },
    [createPeerConnection, flushCandidates],
  );

  const joinVoice = useCallback(async () => {
    if (joined.current) return true;
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch {
      setError("Microphone permission is needed for voice chat.");
      return false;
    }
    localStream.current
      .getAudioTracks()
      .forEach((track) => (track.enabled = micOnRef.current));
    joined.current = true;
    socketRef.current?.emit("voice-join", { roomCode });
    return true;
  }, [roomCode]);

  const leaveVoice = useCallback(() => {
    if (!joined.current) return;
    socketRef.current?.emit("voice-leave", { roomCode });
    Array.from(peers.current.keys()).forEach(removePeer);
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    joined.current = false;
    setPeerCount(0);
  }, [removePeer, roomCode]);

  const toggleMic = useCallback(async () => {
    const next = !micOnRef.current;
    setError(null);
    micOnRef.current = next;
    setMicOn(next);
    if (next && !joined.current) {
      const ok = await joinVoice();
      if (!ok) {
        micOnRef.current = false;
        setMicOn(false);
        return;
      }
    }
    localStream.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = next));
    if (!next && !speakerOnRef.current) leaveVoice();
  }, [joinVoice, leaveVoice]);

  const toggleSpeaker = useCallback(async () => {
    const next = !speakerOnRef.current;
    setError(null);
    speakerOnRef.current = next;
    setSpeakerOn(next);
    if (next && !joined.current) {
      const ok = await joinVoice();
      if (!ok) {
        speakerOnRef.current = false;
        setSpeakerOn(false);
        return;
      }
    }
    audioEls.current.forEach((el) => {
      el.muted = !next;
      if (next) void el.play().catch(() => undefined);
    });
    if (!next && !micOnRef.current) leaveVoice();
  }, [joinVoice, leaveVoice]);

  useEffect(() => {
    if (!socket) return;

    const onPeers = (list: VoicePeer[]) => {
      list.forEach((peer) => void callPeer(peer.peerId));
    };
    const onSignal = (payload: { from: string; data: SignalData }) => {
      void handleSignal(payload);
    };
    const onPeerLeft = ({ peerId }: { peerId: string }) => removePeer(peerId);
    // On reconnect the server has forgotten our voice membership, so re-announce
    // if we were connected; stale peer connections are dropped on disconnect.
    const onReconnect = () => {
      if (joined.current) socket.emit("voice-join", { roomCode });
    };
    const onDisconnect = () => {
      Array.from(peers.current.keys()).forEach(removePeer);
    };

    socket.on("voice-peers", onPeers);
    socket.on("voice-signal", onSignal);
    socket.on("voice-peer-left", onPeerLeft);
    socket.on("connect", onReconnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("voice-peers", onPeers);
      socket.off("voice-signal", onSignal);
      socket.off("voice-peer-left", onPeerLeft);
      socket.off("connect", onReconnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket, callPeer, handleSignal, removePeer, roomCode]);

  // Tear everything down when the component unmounts.
  useEffect(() => () => leaveVoice(), [leaveVoice]);

  return {
    micOn,
    speakerOn,
    peerCount,
    error,
    toggleMic,
    toggleSpeaker,
  };
}
