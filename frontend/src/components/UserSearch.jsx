import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../api/client";
import Avatar from "./Avatar";

export default function UserSearch({ onStartConversation }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/users/search", { params: { q: query } });
        if (!ignore) {
          setUsers(data);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <section className="border-b border-black/10 p-3">
      <div className="flex h-10 items-center gap-2 rounded-md border border-stone-300 bg-white px-3">
        <Search size={18} className="text-stone-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search users"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div className="mt-3 max-h-48 overflow-y-auto">
        {loading ? <p className="px-1 text-xs text-stone-500">Searching...</p> : null}
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => onStartConversation(user.id)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-stone-100"
          >
            <Avatar user={user} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user.username}</p>
              <p className="truncate text-xs text-stone-500">{user.bio || "Start a conversation"}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
