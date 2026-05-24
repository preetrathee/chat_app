import Avatar from "./Avatar";

export default function RequestList({ requests, currentUserId, onAcceptRequest }) {
  return (
    <section className="border-b border-black/10 p-3">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal">Requests</p>
        <h2 className="text-lg font-semibold text-ink">Pending</h2>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {!requests.length ? <p className="px-1 text-sm text-stone-500">No pending requests.</p> : null}
        {requests.map((request) => {
          const incoming = request.receiver.id === currentUserId;
          const person = incoming ? request.requester : request.receiver;
          return (
            <div key={request.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-stone-50">
              <Avatar user={person} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{person.username}</p>
                <p className="truncate text-xs text-stone-500">
                  {incoming ? "Sent you a request" : "Waiting for response"}
                </p>
              </div>
              {incoming ? (
                <button
                  type="button"
                  onClick={() => onAcceptRequest(request.id)}
                  className="rounded-md bg-teal px-3 py-2 text-xs font-semibold text-white"
                >
                  Accept
                </button>
              ) : (
                <span className="text-xs font-medium text-stone-500">Pending</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
