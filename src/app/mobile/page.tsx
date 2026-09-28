"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUTTONS = [
  {
    href: "/mobile/fiches",
    title: "Partenaires et bénéficiaires",
    sub: "Consulter et modifier les fiches",
    bg: "#0a1a3f",
    fg: "#fdf4ed",
    icon: <><path d="M4 8 L8 4 H16 L20 8" /><rect x="4" y="8" width="16" height="12" rx="1.5" /><path d="M10 20 V14 H14 V20" /></>,
  },
  {
    href: "/mobile/planning",
    title: "Planning",
    sub: "Ordre de passage, compléter une collecte, ajouter un point",
    bg: "#4fc1d6",
    fg: "#04262e",
    icon: <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9.5 H20.5 M8 3 V6.5 M16 3 V6.5" /></>,
  },
  {
    href: "/saisie-mobile",
    title: "Distribution",
    sub: "Chiffres, kilos, photos, associations",
    bg: "#2a78d6",
    fg: "#ffffff",
    icon: <><path d="M5 9 H19 L17.5 19 H6.5 Z" /><path d="M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" /></>,
  },
  {
    href: "/mobile/stock",
    title: "Stock",
    sub: "Entrées et sorties",
    bg: "#eda100",
    fg: "#2b1c00",
    icon: <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M4 9.5 H20 M4 14.5 H20" /></>,
  },
];

export default function MobileHome() {
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <div>
      <h1 className="mb-1 font-display text-[30px] leading-tight font-black text-[var(--navy)]">Que veux-tu faire ?</h1>
      <p className="mb-5 text-[14px] text-[var(--slate)]">Version mobile du Superadmin — l&apos;essentiel, sans complication.</p>
      <div className="flex flex-col gap-3.5">
        {BUTTONS.map((b) => (
          <Link key={b.href} href={b.href} className="flex min-h-[104px] items-center gap-4 rounded-[24px] px-5 py-4 shadow-[var(--shadow)] active:scale-[0.99]" style={{ background: b.bg, color: b.fg }}>
            <span className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl" style={{ background: "rgba(255,255,255,0.2)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
                {b.icon}
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[25px] leading-tight font-black">{b.title}</span>
              <span className="mt-0.5 block text-[13px] leading-[1.35] opacity-85">{b.sub}</span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 flex-none opacity-70">
              <path d="M9 5 L16 12 L9 19" />
            </svg>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-center gap-6 text-[13px] font-semibold text-[var(--slate)]">
        <Link href="/dashboard" className="underline">Version PC</Link>
        <button type="button" onClick={logout} className="underline">Se déconnecter</button>
      </div>
    </div>
  );
}
