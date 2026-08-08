import { ArrowLeft, ImagePlus, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { formatDateTime, formatFullDateTime } from "../lib/dates";
import Avatar from "./Avatar";

export default function FeedPanel({
  posts,
  currentUserId,
  loading,
  uploading,
  deletingId,
  error,
  onBack,
  onRefresh,
  onUpload,
  onDelete,
}) {
  const inputRef = useRef(null);
  const [caption, setCaption] = useState("");

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const uploaded = await onUpload(file, caption);
    if (uploaded) {
      setCaption("");
    }
    event.target.value = "";
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
      <header className="border-b border-black/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-stone-300 text-stone-700 transition hover:bg-stone-100 lg:hidden"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft size={18} />
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal">Feed</p>
              <h1 className="text-xl font-bold text-ink">Posts</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="grid h-10 w-10 place-items-center rounded-md border border-stone-300 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Refresh feed"
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Upload post"
              title="Upload post"
            >
              <ImagePlus size={19} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={280}
            placeholder={uploading ? "Uploading..." : "Caption"}
            className="h-10 min-w-0 flex-1 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-mist/60 p-3 sm:p-4">
        {loading ? <p className="text-sm text-stone-500">Loading posts...</p> : null}
        {!loading && !posts.length ? (
          <div className="grid h-full place-items-center">
            <div className="max-w-sm text-center">
              <MessageCircle className="mx-auto text-stone-400" size={28} />
              <h2 className="mt-3 text-lg font-semibold text-ink">No posts yet</h2>
              <p className="mt-1 text-sm text-stone-500">
                Upload a photo or video, or connect with friends to see their posts here.
              </p>
            </div>
          </div>
        ) : null}
        <div className="mx-auto grid max-w-2xl gap-4">
          {posts.map((post) => {
            const mine = post.user_id === currentUserId;
            const timestamp = formatDateTime(post.created_at);
            const fullTimestamp = formatFullDateTime(post.created_at);
            return (
              <article key={post.id} className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
                <header className="flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar user={post.user} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {post.user?.username || "User"}
                        {mine ? <span className="ml-2 text-xs font-medium text-teal">You</span> : null}
                      </p>
                      {timestamp ? (
                        <time
                          dateTime={post.created_at}
                          title={fullTimestamp}
                          className="text-xs text-stone-500"
                        >
                          {timestamp}
                        </time>
                      ) : null}
                    </div>
                  </div>
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => onDelete(post.id)}
                      disabled={deletingId === post.id}
                      className="grid h-9 w-9 place-items-center rounded-md text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Delete post"
                      title="Delete post"
                    >
                      <Trash2 size={17} />
                    </button>
                  ) : null}
                </header>
                <div className="bg-black">
                  {post.media_type === "video" ? (
                    <video
                      src={post.media_url}
                      controls
                      preload="metadata"
                      className="max-h-[70vh] w-full bg-black object-contain"
                    />
                  ) : (
                    <img
                      src={post.media_url}
                      alt={post.caption || "Post"}
                      className="max-h-[70vh] w-full bg-black object-contain"
                    />
                  )}
                </div>
                {post.caption ? (
                  <p className="break-words p-3 text-sm text-ink">
                    <span className="font-semibold">{post.user?.username || "User"}</span>{" "}
                    {post.caption}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
