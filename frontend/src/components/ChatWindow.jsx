import { ArrowLeft, Check, ImagePlus, Phone, SendHorizontal, Smile, Trash2, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import api, { API_URL, WS_URL } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCall } from "../context/CallContext";
import { formatDateTime, formatFullDateTime } from "../lib/dates";
import Avatar from "./Avatar";

const RECENT_EMOJIS_KEY = "socialchat_recent_emojis";
const EMOJI_GROUPS = [
  ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤗", "🤔", "😭", "😡"],
  ["👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "👌", "✌️", "👋", "🤞", "🫶"],
  ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💯", "✨", "🎉", "🔥", "🌟"],
  ["🍕", "🍔", "🍟", "🍩", "☕", "🍎", "⚽", "🏏", "🎵", "🎮", "🚗", "✈️"],
];
const PAGE_SIZE = 30;

function loadRecentEmojis() {
  const fallback = ["😀", "❤️", "🔥", "👍", "🎉", "😂"];
  const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
  if (!stored) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function ChatWindow({
  conversationId,
  conversation: conversationSummary,
  onMessage,
  onMessageDeleted,
  onConversationDeleted,
  onBack,
}) {
  const { token, user } = useAuth();
  const { call, startCall } = useCall();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState(loadRecentEmojis);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const socketRef = useRef(null);
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const pendingScrollRestoreRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);

  const title = useMemo(() => conversation?.other_user?.username || "Select a chat", [conversation]);
  const otherUser = conversationSummary?.other_user || conversation?.other_user;
  const otherUserOnline = Boolean(otherUser?.is_online);
  const callLocked = call.status !== "idle" && call.conversationId !== conversationId;

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setHasMoreMessages(false);
      setSelectionMode(false);
      setSelectedMessageIds([]);
      return;
    }
    let ignore = false;
    async function loadConversation() {
      const [{ data: conversationData }, { data: messageData }] = await Promise.all([
        api.get(`/conversations/${conversationId}`),
        api.get(`/messages/conversation/${conversationId}`, {
          params: { limit: PAGE_SIZE },
        }),
      ]);
      if (!ignore) {
        setConversation(conversationData);
        setMessages(messageData.items || []);
        setHasMoreMessages(messageData.has_more);
        setSelectionMode(false);
        setSelectedMessageIds([]);
        shouldStickToBottomRef.current = true;
      }
    }
    loadConversation();
    return () => {
      ignore = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationSummary?.other_user) {
      return;
    }
    setConversation((current) => {
      if (!current || current.id !== conversationSummary.id) {
        return current;
      }
      return {
        ...current,
        other_user: {
          ...current.other_user,
          is_online: conversationSummary.other_user.is_online,
        },
      };
    });
  }, [conversationSummary]);

  useEffect(() => {
    if (!conversationId || !token) {
      return;
    }
    const socket = new WebSocket(`${WS_URL}/ws/chat/${conversationId}?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "message") {
        const container = messagesContainerRef.current;
        if (container) {
          const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          shouldStickToBottomRef.current = distanceFromBottom < 80;
        }
        setMessages((current) => {
          if (current.some((message) => message.id === payload.message.id)) {
            return current;
          }
          return [...current, payload.message];
        });
        onMessage?.(payload.message);
      }
      if (payload.type === "message_deleted") {
        setMessages((current) => current.filter((message) => message.id !== payload.message_id));
        setSelectedMessageIds((current) => current.filter((messageId) => messageId !== payload.message_id));
        onMessageDeleted?.(payload.conversation_id, payload.message_id);
      }
      if (payload.type === "conversation_deleted") {
        setConversation(null);
        setMessages([]);
        setHasMoreMessages(false);
        setSelectionMode(false);
        setSelectedMessageIds([]);
        onConversationDeleted?.(payload.conversation_id);
      }
    };
    return () => {
      socket.close();
    };
  }, [conversationId, token, onMessage]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    if (pendingScrollRestoreRef.current !== null) {
      const previousHeight = pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
      container.scrollTop += container.scrollHeight - previousHeight;
      return;
    }
    if (shouldStickToBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (emojiPanelRef.current && !emojiPanelRef.current.contains(event.target)) {
        setEmojiOpen(false);
      }
    }

    if (emojiOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [emojiOpen]);

  useEffect(() => {
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recentEmojis));
  }, [recentEmojis]);

  async function loadOlderMessages() {
    if (!conversationId || loadingOlder || !hasMoreMessages || !messages.length) {
      return;
    }
    const container = messagesContainerRef.current;
    if (container) {
      pendingScrollRestoreRef.current = container.scrollHeight;
    }
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/messages/conversation/${conversationId}`, {
        params: { before_id: messages[0].id, limit: PAGE_SIZE },
      });
      setMessages((current) => {
        const seen = new Set(current.map((message) => message.id));
        const older = (data.items || []).filter((message) => !seen.has(message.id));
        return [...older, ...current];
      });
      setHasMoreMessages(data.has_more);
    } finally {
      setLoadingOlder(false);
    }
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) {
        setSelectedMessageIds([]);
      }
      return !current;
    });
  }

  function toggleMessageSelection(messageId) {
    setSelectedMessageIds((current) =>
      current.includes(messageId)
        ? current.filter((currentId) => currentId !== messageId)
        : [...current, messageId],
    );
  }

  async function handleDeleteSelectedMessages() {
    if (!selectedMessageIds.length) {
      return;
    }
    setDeletingSelected(true);
    try {
      await api.post("/messages/bulk-delete", {
        message_ids: selectedMessageIds,
      });
      const selectedIds = new Set(selectedMessageIds);
      setMessages((current) => current.filter((message) => !selectedIds.has(message.id)));
      selectedMessageIds.forEach((messageId) => {
        onMessageDeleted?.(conversationId, messageId);
      });
      setSelectedMessageIds([]);
      setSelectionMode(false);
    } finally {
      setDeletingSelected(false);
    }
  }

  async function handleDeleteConversation() {
    if (!conversationId) {
      return;
    }
    const confirmed = window.confirm("This will delete the complete chat and all messages. Do you want to continue?");
    if (!confirmed) {
      return;
    }
    setDeletingConversation(true);
    try {
      await api.delete(`/conversations/${conversationId}`);
      setConversation(null);
      setMessages([]);
      setHasMoreMessages(false);
      setSelectionMode(false);
      setSelectedMessageIds([]);
      onConversationDeleted?.(conversationId);
    } finally {
      setDeletingConversation(false);
    }
  }

  function handleMessagesScroll(event) {
    const container = event.currentTarget;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
    if (container.scrollTop < 40 && hasMoreMessages && !loadingOlder) {
      loadOlderMessages();
    }
  }

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
    setRecentEmojis((current) => {
      const next = [emoji, ...current.filter((item) => item !== emoji)];
      return next.slice(0, 12);
    });
  }

  function resolveImageUrl(path) {
    return path.startsWith("http") ? path : new URL(path, `${API_URL}/`).toString();
  }

  const selectedCount = selectedMessageIds.length;

  if (!conversationId) {
    return (
      <section className="grid h-full min-h-0 flex-1 place-items-center bg-white">
        <div className="max-w-sm px-6 text-center">
          <h2 className="text-2xl font-semibold text-ink">Your messages</h2>
          <p className="mt-2 text-sm text-stone-500">Search for someone or open a conversation to chat in realtime.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <header className="border-b border-black/10 px-3 py-2 sm:flex sm:h-16 sm:items-center sm:justify-between sm:px-4 sm:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stone-200 text-stone-700 transition hover:bg-stone-100 lg:hidden"
            aria-label="Back to chats"
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <Avatar user={conversation?.other_user} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            <p className="flex items-center gap-1.5 text-xs text-stone-500">
              <span
                className={`h-2 w-2 rounded-full ${otherUserOnline ? "bg-emerald-500" : "bg-stone-300"}`}
              />
              {otherUserOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 sm:mt-0 sm:gap-2">
          {selectionMode ? (
            <>
              <button
                type="button"
                onClick={handleDeleteSelectedMessages}
                disabled={!selectedCount || deletingSelected}
                className="inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:px-4 sm:text-sm"
              >
                <Trash2 size={16} />
                {deletingSelected ? "Deleting..." : `Delete ${selectedCount}`}
              </button>
              <button
                type="button"
                onClick={toggleSelectionMode}
                className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 text-stone-600 transition hover:bg-stone-100 sm:h-10 sm:w-10"
                aria-label="Cancel selection"
                title="Cancel selection"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleSelectionMode}
              disabled={!messages.some((message) => message.sender_id === user.id)}
              className="inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-stone-200 px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:px-4 sm:text-sm"
            >
              <Check size={16} />
              Select
            </button>
          )}
          <button
            type="button"
            onClick={handleDeleteConversation}
            disabled={!conversation || deletingConversation || selectionMode}
            className="grid h-9 w-9 place-items-center rounded-full border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10"
            aria-label="Delete chat"
            title="Delete chat"
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            onClick={() => startCall(conversationId, conversation?.other_user, "audio")}
            disabled={!conversation || callLocked}
            className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10"
            aria-label="Start voice call"
            title="Start voice call"
          >
            <Phone size={18} />
          </button>
          <button
            type="button"
            onClick={() => startCall(conversationId, conversation?.other_user, "video")}
            disabled={!conversation || callLocked}
            className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10"
            aria-label="Start video call"
            title="Start video call"
          >
            <Video size={18} />
          </button>
        </div>
      </header>
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto bg-mist/60 p-3 sm:p-4"
      >
        {hasMoreMessages ? (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingOlder ? "Loading..." : "Load older messages"}
            </button>
          </div>
        ) : null}
        <div className="space-y-3">
          {messages.map((message) => {
            const mine = message.sender_id === user.id;
            const selected = selectedMessageIds.includes(message.id);
            const timestamp = formatDateTime(message.created_at);
            const fullTimestamp = formatFullDateTime(message.created_at);
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  onClick={selectionMode && mine ? () => toggleMessageSelection(message.id) : undefined}
                  className={`max-w-[88%] sm:max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm transition ${
                    mine ? "bg-teal text-white" : "bg-white text-ink"
                  } ${
                    selectionMode && mine ? "cursor-pointer ring-1 ring-transparent hover:ring-white/50" : ""
                  } ${
                    selected ? (mine ? "ring-2 ring-white" : "ring-2 ring-teal") : ""
                  }`}
                >
                  {selectionMode && mine ? (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                        {selected ? "Selected" : "Tap to select"}
                      </span>
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full border ${
                          selected ? "border-white bg-white text-teal" : "border-white/60 text-white/60"
                        }`}
                      >
                        <Check size={12} />
                      </span>
                    </div>
                  ) : null}
                  {message.message_type === "image" ? (
                    <img
                      src={resolveImageUrl(message.content)}
                      alt="Chat upload"
                      className="max-h-72 rounded-md object-cover"
                    />
                  ) : (
                    <p className="break-words">{message.content}</p>
                  )}
                  {timestamp ? (
                    <time
                      dateTime={message.created_at}
                      title={fullTimestamp}
                      className={`mt-1 block text-[11px] leading-4 ${mine ? "text-white/70" : "text-stone-500"}`}
                    >
                      {timestamp}
                    </time>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div ref={endRef} />
      </div>
      <form onSubmit={sendMessage} className="relative flex items-center gap-2 border-t border-black/10 p-2 sm:p-3">
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
          disabled={uploading || selectionMode}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-300 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:w-11"
          aria-label="Upload image"
          title="Upload image"
        >
          <ImagePlus size={20} />
        </button>
        <div className="relative shrink-0" ref={emojiPanelRef}>
          <button
            type="button"
            onClick={() => setEmojiOpen((current) => !current)}
            className="grid h-10 w-10 place-items-center rounded-md border border-stone-300 text-stone-700 transition hover:bg-stone-100 sm:h-11 sm:w-11"
            aria-label="Open emoji picker"
            title="Emoji picker"
          >
            <Smile size={20} />
          </button>
          {emojiOpen ? (
            <div className="absolute bottom-14 left-0 z-20 w-[min(92vw,38rem)] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                      All Emojis
                    </p>
                    <button
                      type="button"
                      onClick={() => setEmojiOpen(false)}
                      className="text-xs text-stone-400 hover:text-stone-700"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {EMOJI_GROUPS.map((group, index) => (
                      <div key={index} className="grid grid-cols-6 gap-1">
                        {group.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => insertEmoji(emoji)}
                            className="rounded-lg px-2 py-2 text-xl transition hover:bg-stone-100"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                    Recent
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {recentEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="rounded-lg px-2 py-2 text-xl transition hover:bg-white"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={
            selectionMode ? "Selection mode enabled" : uploading ? "Uploading image..." : "Message..."
          }
          disabled={selectionMode}
          className="h-10 min-w-0 flex-1 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 sm:h-11"
        />
        <button
          type="submit"
          disabled={uploading || selectionMode}
          className="grid h-10 w-10 place-items-center rounded-md bg-coral text-white transition hover:bg-coral/90 sm:h-11 sm:w-11"
          aria-label="Send message"
          title="Send"
        >
          <SendHorizontal size={20} />
        </button>
      </form>
    </section>
  );
}
