import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import AppShell from "../components/AppShell";
import Avatar from "../components/Avatar";
import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    bio: user?.bio || "",
    avatar_url: user?.avatar_url || "",
  });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const { data } = await api.patch("/users/me", form);
      updateUser(data);
      setStatus("Saved");
    } catch (err) {
      setStatus(err.response?.data?.detail || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          to="/"
          className="mb-4 inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-stone-700 hover:bg-white"
        >
          <ArrowLeft size={18} />
          Back
        </Link>
        <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4 border-b border-black/10 pb-5">
            <Avatar user={{ ...user, avatar_url: form.avatar_url }} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-ink">{user?.username}</h1>
              <p className="truncate text-sm text-stone-500">{user?.email}</p>
            </div>
          </div>
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Avatar URL</span>
              <input
                value={form.avatar_url}
                onChange={(event) => setForm({ ...form, avatar_url: event.target.value })}
                className="h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                placeholder="https://..."
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Bio</span>
              <textarea
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
                maxLength={280}
                rows={4}
                className="w-full resize-none rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                placeholder="Say something short about yourself"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-stone-500">{status}</p>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={18} />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
