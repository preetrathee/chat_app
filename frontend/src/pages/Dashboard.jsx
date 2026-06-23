import { Camera, Heart, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../api/client";
import AppShell from "../components/AppShell";
import ChatWindow from "../components/ChatWindow";
import ConversationList from "../components/ConversationList";
import PeopleList from "../components/PeopleList";
import RequestList from "../components/RequestList";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");

  async function loadDashboard() {
    const [conversationsResponse, discoverResponse, requestResponse] = await Promise.all([
      api.get("/conversations"),
      api.get("/connections/discover"),
      api.get("/connections/requests"),
    ]);
    const nextConversations = conversationsResponse.data;
    setConversations(nextConversations);
    setDiscoverUsers(discoverResponse.data);
    setRequests(requestResponse.data);
    setActiveId((current) => current || nextConversations[0]?.id || null);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

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

  return (
    <AppShell>
      <div className="mx-auto grid h-full max-w-6xl min-h-0 gap-4 px-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
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
        <div className="min-h-0 overflow-hidden rounded-lg border border-black/10 shadow-sm">
          <ChatWindow
            conversationId={activeId}
            onMessage={handleRealtimeMessage}
            onMessageDeleted={handleMessageDeleted}
            onConversationDeleted={handleConversationDeleted}
          />
        </div>
      </div>
    </AppShell>
  );
}
