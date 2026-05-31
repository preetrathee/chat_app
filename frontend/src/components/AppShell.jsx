import { LogOut, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import CallOverlay from "./CallOverlay";
import Avatar from "./Avatar";
import { useAuth } from "../context/AuthContext";

export default function AppShell({ children }) {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-mist">
      <CallOverlay />
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-xl font-bold tracking-normal text-ink">
            SocialChat
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="flex h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              <Avatar user={user} />
              <span className="hidden sm:inline">{user?.username}</span>
            </Link>
            <Link
              to="/profile"
              className="grid h-10 w-10 place-items-center rounded-md text-stone-700 transition hover:bg-stone-100 sm:hidden"
              aria-label="Profile"
            >
              <UserRound size={20} />
            </Link>
            <button
              type="button"
              onClick={logout}
              className="grid h-10 w-10 place-items-center rounded-md text-stone-700 transition hover:bg-stone-100"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}
