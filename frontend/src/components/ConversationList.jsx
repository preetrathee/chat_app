import Avatar from "./Avatar";

export default function ConversationList({ conversations, activeId, onSelect }) {
  if (!conversations.length) {
    return <p className="p-4 text-sm text-stone-500">Accepted connections will appear here.</p>;
  }

  return (
    <section className="p-3">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal">Chats</p>
        <h2 className="text-lg font-semibold text-ink">Messages</h2>
      </div>
      <nav className="max-h-72 overflow-y-auto">
      {conversations.map((conversation) => {
        const active = conversation.id === activeId;
        return (
          <button
            type="button"
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
            className={`mb-1 flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition ${
              active ? "bg-ink text-white" : "text-ink hover:bg-stone-100"
            }`}
          >
            <Avatar user={conversation.other_user} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{conversation.other_user.username}</p>
              <p className={`truncate text-xs ${active ? "text-white/70" : "text-stone-500"}`}>
                {conversation.last_message?.content || "No messages yet"}
              </p>
            </div>
          </button>
        );
      })}
      </nav>
    </section>
  );
}
