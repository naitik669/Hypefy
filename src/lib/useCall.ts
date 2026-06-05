"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type CallType = "audio" | "video";
export type CallStatus = "outgoing" | "incoming" | "connected";

export type CallState = {
  type: CallType;
  status: CallStatus;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

type Signal =
  | { kind: "offer"; from: string; callType: CallType; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; candidate: RTCIceCandidateInit }
  | { kind: "end"; from: string };

/**
 * Peer-to-peer 1:1 audio/video calling over WebRTC, using a Supabase Realtime
 * broadcast channel for signaling (offer / answer / ICE exchange).
 */
export function useCall({
  conversationId,
  userId,
  enabled,
}: {
  conversationId: string;
  userId: string;
  enabled: boolean;
}) {
  const supabase = createClient();
  const [call, setCall] = useState<CallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

  const send = useCallback((payload: Record<string, unknown>) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { ...payload, from: userId },
    });
  }, [userId]);

  const cleanup = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    incomingOfferRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const getMedia = useCallback(async (type: CallType) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video",
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const createPeer = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ kind: "ice", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCall((c) => (c ? { ...c, status: "connected" } : c));
      } else if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        // Remote went away / network died — tear down.
        if (pc.connectionState !== "disconnected") {
          cleanup();
          setCall(null);
        }
      }
    };
    pcRef.current = pc;
    return pc;
  }, [send, cleanup]);

  // Start an outgoing call.
  const startCall = useCallback(async (type: CallType) => {
    setError(null);
    try {
      const stream = await getMedia(type);
      const pc = createPeer(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ kind: "offer", callType: type, sdp: offer });
      setCall({ type, status: "outgoing" });
    } catch {
      cleanup();
      setError("Camera/microphone permission is required to start a call.");
    }
  }, [getMedia, createPeer, send, cleanup]);

  // Accept the incoming call.
  const acceptCall = useCallback(async () => {
    const offer = incomingOfferRef.current;
    if (!offer || !call) return;
    setError(null);
    try {
      const stream = await getMedia(call.type);
      const pc = createPeer(stream);
      await pc.setRemoteDescription(offer);
      for (const c of pendingIceRef.current) await pc.addIceCandidate(c).catch(() => {});
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ kind: "answer", sdp: answer });
      setCall({ type: call.type, status: "connected" });
    } catch {
      cleanup();
      setCall(null);
      setError("Camera/microphone permission is required to answer.");
    }
  }, [call, getMedia, createPeer, send, cleanup]);

  // Hang up / decline.
  const endCall = useCallback(() => {
    send({ kind: "end" });
    cleanup();
    setCall(null);
  }, [send, cleanup]);

  const handleSignal = useCallback(async (s: Signal) => {
    if (s.from === userId) return;
    switch (s.kind) {
      case "offer": {
        if (pcRef.current || incomingOfferRef.current) return; // already busy
        incomingOfferRef.current = s.sdp;
        setCall({ type: s.callType, status: "incoming" });
        break;
      }
      case "answer": {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(s.sdp).catch(() => {});
        for (const c of pendingIceRef.current) await pc.addIceCandidate(c).catch(() => {});
        pendingIceRef.current = [];
        break;
      }
      case "ice": {
        const pc = pcRef.current;
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(s.candidate).catch(() => {});
        } else {
          pendingIceRef.current.push(s.candidate);
        }
        break;
      }
      case "end": {
        cleanup();
        setCall(null);
        break;
      }
    }
  }, [userId, cleanup]);

  // Signaling channel.
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel(`call:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      handleSignal(payload as Signal);
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      cleanup();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, enabled]);

  return { call, localStream, remoteStream, error, startCall, acceptCall, endCall, clearError: () => setError(null) };
}
