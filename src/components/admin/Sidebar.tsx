"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Tableau de bord",
    icon: (
      <>
        <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5" />
        <rect x="13" y="10" width="7.5" height="10.5" rx="1.5" />
        <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      </>
    ),
  },
  {
    href: "/partenaires",
    label: "Partenaires",
    icon: (
      <>
        <path d="M4 8 L8 4 H16 L20 8" />
        <rect x="4" y="8" width="16" height="11" rx="1.5" />
        <path d="M4 8 H20" />
      </>
    ),
  },
  {
    href: "/beneficiaires",
    label: "Bénéficiaires",
    icon: (
      <path d="M12 20 C 6 15.5, 3 12.3, 3 8.8 C 3 6.1, 5.1 4 7.7 4 C 9.4 4, 11 5, 12 6.5 C 13 5, 14.6 4, 16.3 4 C 18.9 4, 21 6.1, 21 8.8 C 21 12.3, 18 15.5, 12 20 Z" />
    ),
  },
  {
    href: "/planning",
    label: "Planning",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
        <path d="M3.5 9.5 H20.5 M8 3 V6.5 M16 3 V6.5" />
      </>
    ),
  },
  {
    href: "/stock",
    label: "Stock",
    icon: (
      <>
        <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
        <path d="M4 9.5 H20 M4 14.5 H20" />
      </>
    ),
  },
  {
    href: "/flotte",
    label: "Flotte",
    icon: (
      <>
        <path d="M4 17 V9.5 L6.5 5 H15 L18 9.5 H20.5 L23 13 V17" />
        <path d="M1 17 H23" />
        <circle cx="7" cy="17" r="2.2" />
        <circle cx="17" cy="17" r="2.2" />
      </>
    ),
  },
  {
    href: "/profil",
    label: "Profil",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20 C 5.5 15.5, 8.3 13.3, 12 13.3 C 15.7 13.3, 18.5 15.5, 19.5 20" />
      </>
    ),
  },
];

const SUPER_ITEM = {
  href: "/villes-comptes",
  label: "Villes & comptes",
  icon: (
    <>
      <path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[236px] flex-none flex-col justify-between bg-[var(--navy-deep)] px-[18px] py-[26px] text-[var(--panel-fg)]">
      <div>
        <div className="flex items-end gap-0.5 px-1.5 pb-[26px]">
          <span className="font-script text-2xl">linkee</span>
          <svg width="30" height="11" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1">
            <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
          </svg>
        </div>
        <nav className="flex flex-col gap-[3px]">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-[11px] rounded-xl px-3 py-[11px] text-sm font-semibold ${
                  active
                    ? "bg-[var(--turquoise)] text-[#04262e]"
                    : "text-[var(--panel-fg-dim)] hover:bg-white/8 hover:text-[var(--panel-fg)]"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[18px] w-[18px] flex-none"
                >
                  {item.icon}
                </svg>
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="my-2.5 h-px bg-white/12" />
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--panel-fg-dim)]">
            Admin principal
          </div>
          <Link
            href={SUPER_ITEM.href}
            className={`flex items-center gap-[11px] rounded-xl px-3 py-[11px] text-sm font-semibold ${
              pathname === SUPER_ITEM.href
                ? "bg-[var(--turquoise)] text-[#04262e]"
                : "text-[var(--panel-fg-dim)] hover:bg-white/8 hover:text-[var(--panel-fg)]"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px] flex-none"
            >
              {SUPER_ITEM.icon}
            </svg>
            <span>{SUPER_ITEM.label}</span>
          </Link>
        </nav>
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[var(--turquoise)] font-display text-sm font-bold text-[#04262e]">
            S
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[13.5px] font-bold text-[var(--panel-fg)]">Simon</span>
            <span className="block text-[11.5px] text-[var(--panel-fg-dim)]">Admin principal</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-[9px] px-2.5 py-2 text-[13px] font-semibold text-[var(--panel-fg-dim)] hover:text-[var(--panel-fg)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M9 4 H6 a1.5 1.5 0 0 0 -1.5 1.5 v13 A1.5 1.5 0 0 0 6 20 h3" />
            <path d="M15 16 L20 12 L15 8" />
            <path d="M20 12 H9" />
          </svg>
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
