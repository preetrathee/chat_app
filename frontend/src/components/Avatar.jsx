export default function Avatar({ user, size = "md" }) {
  const dimensions = size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm";
  const initial = user?.username?.charAt(0)?.toUpperCase() || "?";

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.username}
        className={`${dimensions} rounded-full object-cover ring-1 ring-black/10`}
      />
    );
  }

  return (
    <div className={`${dimensions} grid shrink-0 place-items-center rounded-full bg-ink text-white`}>
      {initial}
    </div>
  );
}
