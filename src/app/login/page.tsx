"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="w-full max-w-[380px] overflow-hidden rounded-[28px] bg-[var(--card)] shadow-[0_16px_36px_-22px_rgba(0,22,65,0.30)]">
        <div
          className="px-7 pt-8 pb-6 text-center text-[var(--panel-fg)]"
          style={{
            background:
              "radial-gradient(circle at 12% 0%, rgba(79,193,214,0.22), transparent 55%), var(--navy-deep)",
          }}
        >
          <div className="flex items-end justify-center gap-0.5">
            <span className="font-script text-[32px] leading-none">linkee</span>
            <svg width="34" height="12" viewBox="0 0 40 14" fill="none" aria-hidden="true">
              <path
                d="M2 3 C 10 13, 30 13, 38 3"
                stroke="var(--turquoise)"
                strokeWidth={4}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="mt-1.5 font-display text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--panel-fg-dim)]">
            Entraide étudiante
          </p>
          <h1 className="mt-4 font-display text-[22px] font-black">Bienvenue !</h1>
          <p className="mx-auto mt-1 max-w-[260px] text-[12.5px] leading-relaxed text-[var(--panel-fg-dim)]">
            Connectez-vous pour accéder à votre espace Linkee.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-7 pt-6 pb-6">
          <div className="mb-3 flex flex-col gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="email">
              Adresse email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[13px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-sm font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
              placeholder="prenom@linkee.org"
            />
          </div>
          <div className="mb-3 flex flex-col gap-1.5">
            <label className="text-[12.5px] font-semibold" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[13px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-sm font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="mb-3 text-[12.5px] font-medium text-[var(--critical)]">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-[40px] bg-[var(--navy-deep)] py-3 font-display text-base font-bold text-[var(--panel-fg)] shadow-[0_16px_36px_-22px_rgba(0,22,65,0.30)] disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </main>
  );
}
