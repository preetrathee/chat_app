import { Camera, Heart, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import api, { WS_URL } from "../api/client";
import AppShell from "../components/AppShell";
import ChatWindow from "../components/ChatWindow";
import ConversationList from "../components/ConversationList";
import PeopleList from "../components/PeopleList";
import RequestList from "../components/RequestList";
import UserMediaPanel from "../components/UserMediaPanel";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [media, setMedia] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState(null);

  async function loadDashboard() {
    const [conversationsResponse, discoverResponse, requestResponse, mediaResponse] = await Promise.all([
      api.get("/conversations"),
      api.get("/connections/discover"),
      api.get("/connections/requests"),
      api.get("/media/me"),
    ]);
    const nextConversations = conversationsResponse.data;
    setConversations(nextConversations);
    setDiscoverUsers(discoverResponse.data);
    setRequests(requestResponse.data);
    setMedia(mediaResponse.data);
    setActiveId((current) => current || nextConversations[0]?.id || null);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    function applyPresence(userId, isOnline) {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.other_user?.id === userId
            ? {
                ...conversation,
                other_user: {
                  ...conversation.other_user,
                  is_online: isOnline,
                },
              }
            : conversation,
        ),
      );
      setDiscoverUsers((current) =>
        current.map((item) => (item.id === userId ? { ...item, is_online: isOnline } : item)),
      );
      setRequests((current) =>
        current.map((request) => ({
          ...request,
          requester:
            request.requester?.id === userId
              ? { ...request.requester, is_online: isOnline }
              : request.requester,
          receiver:
            request.receiver?.id === userId
              ? { ...request.receiver, is_online: isOnline }
              : request.receiver,
        })),
      );
    }

    const socket = new WebSocket(`${WS_URL}/ws/presence?token=${encodeURIComponent(token)}`);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "presence_snapshot") {
        const onlineIds = new Set(payload.online_user_ids || []);
        setConversations((current) =>
          current.map((conversation) => ({
            ...conversation,
            other_user: {
              ...conversation.other_user,
              is_online: onlineIds.has(conversation.other_user?.id),
            },
          })),
        );
        setDiscoverUsers((current) =>
          current.map((item) => ({ ...item, is_online: onlineIds.has(item.id) })),
        );
        setRequests((current) =>
          current.map((request) => ({
            ...request,
            requester: {
              ...request.requester,
              is_online: onlineIds.has(request.requester?.id),
            },
            receiver: {
              ...request.receiver,
              is_online: onlineIds.has(request.receiver?.id),
            },
          })),
        );
      }
      if (payload.type === "presence") {
        applyPresence(payload.user_id, payload.is_online);
      }
    };

    return () => {
      socket.close();
    };
  }, [token]);

  async function sendRequest(userId) {
    setError("");
    try {
      await api.post("/connections/request", { user_id: userId });
      await loadDashboard();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not send request");
    }
  }

  async function acceptRequest(requestId) {
    setError("");
    try {
      await api.post(`/connections/${requestId}/accept`);
      await loadDashboard();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not accept request");
    }
  }

  async function startConversation(userId) {
    setError("");
    try {
      const { data } = await api.post("/conversations", { user_id: userId });
      setConversations((current) => {
        if (current.some((conversation) => conversation.id === data.id)) {
          return current;
        }
        return [data, ...current];
      });
      setActiveId(data.id);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not open conversation");
    }
  }

  async function uploadMedia(file, caption) {
    setMediaError("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("caption", caption);
    setUploadingMedia(true);
    try {
      const { data } = await api.post("/media", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMedia((current) => [data, ...current]);
      return true;
    } catch (err) {
      setMediaError(err.response?.data?.detail || "Could not upload media");
      return false;
    } finally {
      setUploadingMedia(false);
    }
  }

  async function deleteMedia(mediaId) {
    const confirmed = window.confirm("Delete this photo or video?");
    if (!confirmed) {
      return;
    }
    setMediaError("");
    setDeletingMediaId(mediaId);
    try {
      await api.delete(`/media/${mediaId}`);
      setMedia((current) => current.filter((item) => item.id !== mediaId));
    } catch (err) {
      setMediaError(err.response?.data?.detail || "Could not delete media");
    } finally {
      setDeletingMediaId(null);
    }
  }

  function handleRealtimeMessage(message) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === message.conversation_id
          ? { ...conversation, last_message: message }
          : conversation,
      ),
    );
  }

  function handleMessageDeleted(conversationId, messageId) {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }
        if (conversation.last_message?.id === messageId) {
          return { ...conversation, last_message: null };
        }
        return conversation;
      }),
    );
  }

  function handleConversationDeleted(conversationId) {
    setConversations((current) => {
      const nextConversations = current.filter((conversation) => conversation.id !== conversationId);
      setActiveId((active) => {
        if (active !== conversationId) {
          return active;
        }
        return nextConversations[0]?.id || null;
      });
      return nextConversations;
    });
  }

  const sidebar = (
    <aside className="min-h-0 overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
      <section className="border-b border-black/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal">Home</p>
            <h1 className="text-xl font-bold text-ink">Chats</h1>
          </div>
          <div className="flex gap-1 text-stone-500">
            <Camera size={19} />
            <Heart size={19} />
            <MessageCircle size={19} />
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-500">
          Signed in as <span className="font-semibold text-ink">{user?.username}</span>
        </p>
        {user?.is_admin ? (
          <p className="mt-1 text-xs font-medium text-coral">Admin account</p>
        ) : null}
      </section>
      <PeopleList
        users={discoverUsers}
        onSendRequest={sendRequest}
        onAcceptRequest={acceptRequest}
        onStartConversation={startConversation}
      />
      <UserMediaPanel
        media={media}
        uploading={uploadingMedia}
        deletingId={deletingMediaId}
        error={mediaError}
        onUpload={uploadMedia}
        onDelete={deleteMedia}
      />
      <RequestList
        requests={requests}
        currentUserId={user?.id}
        onAcceptRequest={acceptRequest}
      />
      {error ? <p className="border-b border-black/10 px-4 py-3 text-sm text-red-600">{error}</p> : null}
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
      />
    </aside>
  );

  const chatPanel = (
    <div className="min-h-0 overflow-hidden rounded-lg border border-black/10 shadow-sm">
      <ChatWindow
        conversationId={activeId}
        conversation={conversations.find((item) => item.id === activeId) || null}
        onMessage={handleRealtimeMessage}
        onMessageDeleted={handleMessageDeleted}
        onConversationDeleted={handleConversationDeleted}
        onBack={() => setActiveId(null)}
      />
    </div>
  );

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-6xl min-h-0 px-3 py-3 sm:px-4 sm:py-4">
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:hidden">
          {activeId ? chatPanel : sidebar}
        </div>
        <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-4">
          {sidebar}
          {chatPanel}
        </div>
      </div>
    </AppShell>
  );
}
