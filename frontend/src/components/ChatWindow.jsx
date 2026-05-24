import { ImagePlus, SendHorizontal, Smile } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import api, { API_URL, WS_URL } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";

const QUICK_EMOJIS = ["😀", "😂", "❤️", "🔥", "👍", "🎉"];

export default function ChatWindow({ conversationId, onMessage }) {
  const { token, user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [connected, setConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const socketRef = useRef(null);
  const endRef = useRef(null);
  const fileInputRef = useRef(null);

  const title = useMemo(() => conversation?.other_user?.username || "Select a chat", [conversation]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    let ignore = false;
    async function loadConversation() {
      const { data } = await api.get(`/conversations/${conversationId}`);
      if (!ignore) {
        setConversation(data);
        setMessages(data.messages || []);
      }
    }
    loadConversation();
    return () => {
      ignore = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !token) {
      return;
    }
    const socket = new WebSocket(`${WS_URL}/ws/chat/${conversationId}?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "message") {
        setMessages((current) => {
          if (current.some((message) => message.id === payload.message.id)) {
            return current;
          }
          return [...current, payload.message];
        });
        onMessage?.(payload.message);
      }
    };
    return () => {
      socket.close();
    };
  }, [conversationId, token, onMessage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(event) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    socketRef.current.send(JSON.stringify({ content: trimmed }));
    setContent("");
  }

  async function sendImage(event) {
    const file = event.target.files?.[0];
    if (!file || !conversationId) {
      return;
    }
    const formData = new FormData();
    formData.append("image", file);
    setUploading(true);
    try {
      await api.post(`/messages/conversation/${conversationId}/image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function insertEmoji(emoji) {
    setContent((current) => `${current}${emoji}`);
  }

  function resolveImageUrl(path) {
    return path.startsWith("http") ? path : `${API_URL}${path}`;
  }

  if (!conversationId) {
    return (
      <section className="grid min-h-[70vh] flex-1 place-items-center bg-white">
        <div className="max-w-sm px-6 text-center">
          <h2 className="text-2xl font-semibold text-ink">Your messages</h2>
          <p className="mt-2 text-sm text-stone-500">Search for someone or open a conversation to chat in realtime.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[70vh] flex-1 flex-col bg-white">
      <header className="flex h-16 items-center justify-between border-b border-black/10 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={conversation?.other_user} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            <p className="text-xs text-stone-500">{connected ? "Online" : "Connecting..."}</p>
          </div>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-mist/60 p-4">
        {messages.map((message) => {
          const mine = message.sender_id === user.id;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  mine ? "bg-teal text-white" : "bg-white text-ink"
                }`}
              >
                {message.message_type === "image" ? (
                  <img
                    src={resolveImageUrl(message.content)}
                    alt="Chat upload"
                    className="max-h-72 rounded-md object-cover"
                  />
                ) : (
                  <p className="break-words">{message.content}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-black/10 px-3 pt-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          <Smile size={16} className="text-stone-400" />
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="rounded-md px-2 py-1 text-lg hover:bg-stone-100"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={sendMessage} className="flex items-center gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={sendImage}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-stone-300 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Upload image"
          title="Upload image"
        >
          <ImagePlus size={20} />
        </button>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={uploading ? "Uploading image..." : "Message..."}
          className="h-11 min-w-0 flex-1 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
        <button
          type="submit"
          disabled={uploading}
          className="grid h-11 w-11 place-items-center rounded-md bg-coral text-white transition hover:bg-coral/90"
          aria-label="Send message"
          title="Send"
        >
          <SendHorizontal size={20} />
        </button>
      </form>
    </section>
  );
}
