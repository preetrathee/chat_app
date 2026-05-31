import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";

import { useCall } from "../context/CallContext";

function VideoPanel({ label, mirrored = false, stream, muted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/60">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/60">
        <span>{label}</span>
        <span>{stream ? "Live" : "Waiting"}</span>
      </div>
      <div className="aspect-video bg-neutral-950">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className={`h-full w-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-white/50">No video</div>
        )}
      </div>
    </div>
  );
}

export default function CallOverlay() {
  const {
    call,
    localStream,
    remoteStream,
    muted,
    cameraEnabled,
    error,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
  } = useCall();

  if (call.status === "idle") {
    return null;
  }

  const title =
    call.status === "incoming"
      ? `${call.otherUsername} is calling`
      : `Call with ${call.otherUsername || "user"}`;
  const subtitleByStatus = {
    outgoing: call.mode === "video" ? "Ringing for video call..." : "Ringing for voice call...",
    incoming: call.mode === "video" ? "Incoming video call" : "Incoming voice call",
    connecting: "Connecting...",
    active: call.mode === "video" ? "Video call in progress" : "Voice call in progress",
  };
  const showVideo = call.mode === "video";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[28px] bg-[#121212] p-5 text-white shadow-2xl">
        <div className="flex flex-col gap-1 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">Live Call</p>
            <h2 className="text-2xl font-semibold">{title}</h2>
            <p className="text-sm text-white/60">{subtitleByStatus[call.status] || "Call session"}</p>
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>

        <div className={`mt-5 grid gap-4 ${showVideo ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          <VideoPanel label="You" mirrored stream={localStream} muted />
          {showVideo ? <VideoPanel label={call.otherUsername || "Remote"} stream={remoteStream} /> : null}
        </div>

        {!showVideo ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center">
            <p className="text-lg font-medium">{call.otherUsername || "Remote user"}</p>
            <p className="mt-1 text-sm text-white/55">
              {call.status === "active" ? "Voice channel connected" : "Waiting for the other side"}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {call.status === "incoming" ? (
            <>
              <button
                type="button"
                onClick={declineCall}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-red-500 px-5 text-sm font-semibold text-white"
              >
                <PhoneOff size={18} />
                Decline
              </button>
              <button
                type="button"
                onClick={acceptCall}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white"
              >
                <Phone size={18} />
                Accept
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMute}
                className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                title={muted ? "Unmute microphone" : "Mute microphone"}
              >
                {muted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              {showVideo ? (
                <button
                  type="button"
                  onClick={toggleCamera}
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
                  title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
                >
                  {cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              ) : null}
              <button
                type="button"
                onClick={endCall}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-red-500 px-5 text-sm font-semibold text-white"
              >
                <PhoneOff size={18} />
                End call
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
