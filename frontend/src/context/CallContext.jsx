import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { WS_URL } from "../api/client";
import { useAuth } from "./AuthContext";

const SIGNALING_STATES = {
  idle: "idle",
  outgoing: "outgoing",
  incoming: "incoming",
  connecting: "connecting",
  active: "active",
};

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const CallContext = createContext(null);

function buildInitialCallState() {
  return {
    status: SIGNALING_STATES.idle,
    conversationId: null,
    mode: "audio",
    otherUserId: null,
    otherUsername: "",
    incoming: false,
  };
}

export function CallProvider({ children }) {
  const { token, user } = useAuth();
  const [call, setCall] = useState(buildInitialCallState);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [error, setError] = useState("");
  const signalingSocketRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const currentCallRef = useRef(buildInitialCallState());

  useEffect(() => {
    currentCallRef.current = call;
  }, [call]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    remoteStreamRef.current = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (!token) {
      closeCallSession();
      return undefined;
    }

    const socket = new WebSocket(`${WS_URL}/ws/signaling?token=${encodeURIComponent(token)}`);
    signalingSocketRef.current = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleSignalingMessage(message);
    };
    socket.onclose = () => {
      if (signalingSocketRef.current === socket) {
        signalingSocketRef.current = null;
      }
    };

    return () => {
      if (signalingSocketRef.current === socket) {
        signalingSocketRef.current = null;
      }
      socket.close();
    };
  }, [token]);

  function sendSignal(payload) {
    const socket = signalingSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Call signaling is not connected");
    }
    socket.send(JSON.stringify(payload));
  }

  function stopStream(stream) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function resetMediaState() {
    stopStream(localStreamRef.current);
    stopStream(remoteStreamRef.current);
    setLocalStream(null);
    setRemoteStream(null);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setMuted(false);
    setCameraEnabled(true);
  }

  function destroyPeer() {
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
  }

  function closeCallSession() {
    destroyPeer();
    resetMediaState();
    setError("");
    setCall(buildInitialCallState());
  }

  async function ensureLocalStream(mode) {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video",
    });
    setLocalStream(stream);
    localStreamRef.current = stream;
    setCameraEnabled(mode === "video");
    return stream;
  }

  function createPeerConnection(callState) {
    destroyPeer();
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peer.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      sendSignal({
        type: "ice_candidate",
        conversation_id: callState.conversationId,
        payload: event.candidate,
      });
    };
    peer.ontrack = (event) => {
      const nextStream = event.streams[0];
      if (nextStream) {
        setRemoteStream(nextStream);
        remoteStreamRef.current = nextStream;
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setCall((current) => ({ ...current, status: SIGNALING_STATES.active }));
      }
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
        closeCallSession();
      }
    };
    peerRef.current = peer;
    return peer;
  }

  async function attachLocalTracks(peer, mode) {
    const stream = await ensureLocalStream(mode);
    stream.getTracks().forEach((track) => {
      const alreadyAdded = peer
        .getSenders()
        .some((sender) => sender.track && sender.track.id === track.id);
      if (!alreadyAdded) {
        peer.addTrack(track, stream);
      }
    });
  }

  async function startCall(conversationId, otherUser, mode) {
    if (!conversationId || !otherUser?.id) {
      return;
    }
    if (currentCallRef.current.status !== SIGNALING_STATES.idle) {
      setError("Finish the current call first");
      return;
    }

    try {
      setError("");
      await ensureLocalStream(mode);
      const nextCall = {
        status: SIGNALING_STATES.outgoing,
        conversationId,
        mode,
        otherUserId: otherUser.id,
        otherUsername: otherUser.username,
        incoming: false,
      };
      setCall(nextCall);
      sendSignal({
        type: "call_invite",
        conversation_id: conversationId,
        mode,
      });
    } catch (nextError) {
      closeCallSession();
      setError(nextError.message || "Could not start call");
    }
  }

  async function acceptCall() {
    const activeCall = currentCallRef.current;
    if (activeCall.status !== SIGNALING_STATES.incoming) {
      return;
    }

    try {
      setError("");
      await ensureLocalStream(activeCall.mode);
      setCall((current) => ({
        ...current,
        status: SIGNALING_STATES.connecting,
        incoming: false,
      }));
      sendSignal({
        type: "call_accept",
        conversation_id: activeCall.conversationId,
      });
    } catch (nextError) {
      declineCall();
      setError(nextError.message || "Could not access microphone/camera");
    }
  }

  function declineCall() {
    const activeCall = currentCallRef.current;
    if (!activeCall.conversationId) {
      closeCallSession();
      return;
    }
    try {
      sendSignal({
        type: "call_decline",
        conversation_id: activeCall.conversationId,
      });
    } catch {
      // The UI still needs to recover if signaling is already gone.
    }
    closeCallSession();
  }

  function endCall() {
    const activeCall = currentCallRef.current;
    if (activeCall.conversationId) {
      try {
        sendSignal({
          type: "call_hangup",
          conversation_id: activeCall.conversationId,
        });
      } catch {
        // Best effort notification.
      }
    }
    closeCallSession();
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) {
      return;
    }
    const nextEnabled = !cameraEnabled;
    videoTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setCameraEnabled(nextEnabled);
  }

  async function createAndSendOffer(callState) {
    const peer = createPeerConnection(callState);
    await attachLocalTracks(peer, callState.mode);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal({
      type: "webrtc_offer",
      conversation_id: callState.conversationId,
      payload: offer,
    });
  }

  async function handleOffer(message) {
    const activeCall = currentCallRef.current;
    const mode = activeCall.mode || "audio";
    const nextCall = {
      status: SIGNALING_STATES.connecting,
      conversationId: message.conversation_id,
      mode,
      otherUserId: message.from_user_id,
      otherUsername: activeCall.otherUsername,
      incoming: false,
    };
    setCall(nextCall);
    const peer = createPeerConnection(nextCall);
    await attachLocalTracks(peer, mode);
    await peer.setRemoteDescription(new RTCSessionDescription(message.payload));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    sendSignal({
      type: "webrtc_answer",
      conversation_id: message.conversation_id,
      payload: answer,
    });
  }

  async function handleAnswer(message) {
    if (!peerRef.current) {
      return;
    }
    await peerRef.current.setRemoteDescription(new RTCSessionDescription(message.payload));
  }

  async function handleCandidate(message) {
    if (!peerRef.current || !message.payload) {
      return;
    }
    try {
      await peerRef.current.addIceCandidate(new RTCIceCandidate(message.payload));
    } catch {
      // Ignore late candidates after teardown.
    }
  }

  async function handleSignalingMessage(message) {
    try {
      if (message.type === "error") {
        setError(message.detail || "Call signaling error");
        return;
      }

      if (message.type === "call_invite") {
        if (currentCallRef.current.status !== SIGNALING_STATES.idle) {
          sendSignal({
            type: "call_busy",
            conversation_id: message.conversation_id,
          });
          return;
        }
        setError("");
        setCall({
          status: SIGNALING_STATES.incoming,
          conversationId: message.conversation_id,
          mode: message.mode === "video" ? "video" : "audio",
          otherUserId: message.from_user_id,
          otherUsername: message.from_username || "Unknown user",
          incoming: true,
        });
        return;
      }

      if (message.type === "call_accept") {
        await createAndSendOffer(currentCallRef.current);
        return;
      }

      if (message.type === "call_decline") {
        setError("Call declined");
        closeCallSession();
        return;
      }

      if (message.type === "call_busy") {
        setError("User is already on another call");
        closeCallSession();
        return;
      }

      if (message.type === "call_hangup") {
        closeCallSession();
        return;
      }

      if (message.type === "webrtc_offer") {
        await handleOffer(message);
        return;
      }

      if (message.type === "webrtc_answer") {
        await handleAnswer(message);
        return;
      }

      if (message.type === "ice_candidate") {
        await handleCandidate(message);
      }
    } catch (nextError) {
      setError(nextError.message || "Call setup failed");
      closeCallSession();
    }
  }

  const value = useMemo(
    () => ({
      call,
      localStream,
      remoteStream,
      muted,
      cameraEnabled,
      error,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMute,
      toggleCamera,
    }),
    [call, localStream, remoteStream, muted, cameraEnabled, error],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used inside CallProvider");
  }
  return context;
}
