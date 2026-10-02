"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import BetaBadge from "@/components/BetaBadge";
import BetaNote from "@/components/BetaNote";
import { useLinker } from "./LinkerContext";
import { REMONTEE_COLOR, useRemonteeBadge } from "@/lib/remontees";

const TABS: { href: string; label: string; icon: ReactNode; accent?: boolean }[] = [
  { href: "/linker/accueil", label: "Accueil", icon: <><path d="M4 11 L12 4 L20 11" /><path d="M6 10 V20 H18 V10" /></> },
  { href: "/linker/carte", label: "Links", icon: <><path d="M12 21 C 8 16.5 5 13 5 9.5 A7 7 0 0 1 19 9.5 C 19 13 16 16.5 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></> },
  { href: "/linker/garde-robe", label: "Garde-robe", icon: <><rect x="5" y="8" width="14" height="12" rx="2" /><path d="M9 8 V6 A3 3 0 0 1 15 6 V8" /></> },
  { href: "/linker/profil", label: "Profil", icon: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20 C 5.5 15.5 8.3 13.3 12 13.3 C 15.7 13.3 18.5 15.5 19.5 20" /></> },
  { href: "/linker/remontees", label: "Remontées", accent: true, icon: <><path d="M4 5.5 A2 2 0 0 1 6 3.5 H18 A2 2 0 0 1 20 5.5 V15 A2 2 0 0 1 18 17 H10 L5 21 V17 H6 A2 2 0 0 1 4 15 Z" /><path d="M8.5 8.5 H15.5 M8.5 12 H13" /></> },
];

/** Bottom-tab shell for the authenticated Linker app: mobile-first, 100% client, no dependency on Next server features. */
export default function LinkerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { linker } = useLinker();
  const remonteeBadge = useRemonteeBadge();

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-20">
      <header className="flex items-center justify-between bg-[var(--navy-deep)] px-4 py-3 text-[var(--panel-fg)]">
        <div className="flex items-center gap-2">
          <Link href="/linker/accueil" className="flex items-end gap-0.5">
            <span className="font-script text-[22px] leading-none">linkee</span>
            <svg width="26" height="9" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-0.5">
              <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
            </svg>
          </Link>
          <BetaBadge onDark label="Bêta test" />
        </div>
        <div className="flex items-center gap-2.5 text-[12.5px] font-bold">
          {linker && <span className="rounded-[40px] bg-white/12 px-3 py-1">🪙 {linker.points}</span>}
          <button type="button" onClick={logout} className="text-[var(--panel-fg-dim)] hover:text-[var(--panel-fg)]">
            Déconnexion
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[560px] px-4 pt-5">
        {(pathname === "/linker/accueil" || pathname === "/linker/carte") && <BetaNote audience="linker" href="/linker/remontees" className="mb-4" />}
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--border)] bg-[var(--card)] px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.3)]">
        {TABS.map((t) => {
          const on = pathname === t.href || pathname.startsWith(t.href + "/") || (t.href === "/linker/carte" && pathname.startsWith("/linker/link/"));
          return (
            <Link
              key={t.href}
              href={t.href}
              style={t.accent ? { color: REMONTEE_COLOR } : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-bold ${t.accent ? "" : on ? "text-[var(--navy)]" : "text-[var(--muted)]"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 rounded-full ${on ? (t.accent ? "bg-[#B23B72]/15" : "bg-[var(--turquoise)]/25") : ""}`}>
                {t.icon}
              </svg>
              {t.label}
              {t.accent && remonteeBadge > 0 && <span className="absolute top-0.5 right-[22%] flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B23B72] px-1 text-[9.5px] font-bold text-white">{remonteeBadge}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
