import Avatar from "./Avatar";

export default function PeopleList({ users, onSendRequest, onAcceptRequest, onStartConversation }) {
  return (
    <section className="border-b border-black/10 p-3">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal">People</p>
        <h2 className="text-lg font-semibold text-ink">Discover</h2>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {!users.length ? <p className="px-1 text-sm text-stone-500">No users found.</p> : null}
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-3 rounded-md px-2 py-2 transition hover:bg-stone-50"
          >
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {user.username}
                {user.is_admin ? <span className="ml-2 text-xs font-medium text-coral">Admin</span> : null}
              </p>
              <p className="truncate text-xs text-stone-500">{user.bio || "Available to connect"}</p>
            </div>
            {user.connection_status === "none" ? (
              <button
                type="button"
                onClick={() => onSendRequest(user.id)}
                className="rounded-md bg-ink px-3 py-2 text-xs font-semibold text-white"
              >
                Send request
              </button>
            ) : null}
            {user.connection_status === "pending_sent" ? (
              <span className="text-xs font-medium text-stone-500">Pending</span>
            ) : null}
            {user.connection_status === "pending_received" ? (
              <button
                type="button"
                onClick={() => onAcceptRequest(user.request_id)}
                className="rounded-md bg-teal px-3 py-2 text-xs font-semibold text-white"
              >
                Accept
              </button>
            ) : null}
            {user.connection_status === "accepted" ? (
              <button
                type="button"
                onClick={() => onStartConversation(user.id)}
                className="rounded-md bg-teal px-3 py-2 text-xs font-semibold text-white"
              >
                Message
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
