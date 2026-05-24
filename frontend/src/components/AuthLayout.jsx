import { MessageCircle } from "lucide-react";

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="grid min-h-screen place-items-center bg-mist px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-coral text-white">
            <MessageCircle size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">{title}</h1>
            <p className="text-sm text-stone-500">{subtitle}</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
