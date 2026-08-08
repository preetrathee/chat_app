import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { formatDateTime, formatFullDateTime } from "../lib/dates";

export default function UserMediaPanel({
  title = "My media",
  eyebrow = "Profile",
  emptyText = "Photos and videos you upload will appear here.",
  media,
  uploading,
  deletingId,
  error,
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
    <section className="border-b border-black/10 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal">{eyebrow}</p>
          <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
        </div>
        {onUpload ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-ink text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Upload media"
            title="Upload media"
          >
            {uploading ? <Upload size={17} /> : <ImagePlus size={18} />}
          </button>
        ) : null}
      </div>
      {onUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={280}
            placeholder="Caption"
            className="mb-3 h-9 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
        </>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {!media.length ? (
        <p className="text-sm text-stone-500">{emptyText}</p>
      ) : (
        <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1">
          {media.map((item) => {
            const timestamp = formatDateTime(item.created_at);
            const fullTimestamp = formatFullDateTime(item.created_at);
            return (
              <article key={item.id} className="group relative overflow-hidden rounded-md bg-stone-100">
                <div className="aspect-square w-full bg-stone-200">
                  {item.media_type === "video" ? (
                    <video
                      src={item.media_url}
                      controls
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={item.media_url}
                      alt={item.caption || "Uploaded media"}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md bg-black/70 text-white opacity-100 transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Delete media"
                    title="Delete media"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
                {item.caption ? (
                  <p className="truncate px-2 py-1 text-xs text-stone-700" title={item.caption}>
                    {item.caption}
                  </p>
                ) : timestamp ? (
                  <time
                    dateTime={item.created_at}
                    title={fullTimestamp}
                    className="block truncate px-2 py-1 text-xs text-stone-500"
                  >
                    {timestamp}
                  </time>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
