"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

// STUN lets peers discover their public address; that alone works on a LAN or
// lenient home routers. Across the open internet, many players sit behind
// strict/symmetric NATs (mobile data, corporate/uni networks) where a direct
// path can't be found — those need a TURN relay to carry the audio.
//
// Set NEXT_PUBLIC_TURN_URL / _USERNAME / _CREDENTIAL to your own TURN server
// for reliable connections (multiple URLs may be comma-separated). When unset
// we fall back to Metered's free public "Open Relay" TURN so voice at least
// works out of the box — fine for testing, not guaranteed for production load.
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((url) => url.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  } else {
    servers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return servers;
}

const ICE_SERVERS: RTCConfiguration = { iceServers: buildIceServers() };

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
        console.debug("[voice] receiving audio from", peerId);
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
        console.debug("[voice] peer", peerId, "->", pc.connectionState);
        if (pc.connectionState === "failed") {
          setError(
            "Couldn't connect to a player's audio — their network may need a TURN relay.",
          );
        }
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
    // getUserMedia only exists in a secure context (HTTPS or localhost).
    // Over a plain-HTTP LAN address (e.g. http://192.168.x.x:3000) the browser
    // hides the mic entirely, so surface that instead of a generic error.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Voice needs HTTPS or localhost — a plain http:// LAN address can't use the mic.",
      );
      return false;
    }
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err) {
      const reason =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission was blocked. Allow it in your browser and retry."
          : "Couldn't access a microphone for voice chat.";
      setError(reason);
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
