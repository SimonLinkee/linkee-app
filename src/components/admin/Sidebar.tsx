"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_DEFS, critterSvg, type AvatarKey } from "@/lib/avatars";
import NotificationBell from "@/components/NotificationBell";
import { useCity } from "@/components/admin/CityContext";
import { countLateDistributions } from "@/lib/distributions";

/** readable text colour (white or dark navy) on top of a hex background */
function textOn(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#04162e" : "#ffffff";
}

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
    label: "Partenaires & bénéficiaires",
    icon: (
      <>
        <path d="M4 8 L8 4 H16 L20 8" />
        <rect x="4" y="8" width="16" height="11" rx="1.5" />
        <path d="M4 8 H20" />
      </>
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
    href: "/distributions",
    label: "Distributions",
    icon: (
      <>
        <path d="M5 9 H19 L17.5 19 H6.5 Z" />
        <path d="M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" />
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
    href: "/todo",
    label: "TODO",
    icon: (
      <>
        <path d="M9 11 L12 14 L20 6" />
        <path d="M20 12 V18 A2 2 0 0 1 18 20 H6 A2 2 0 0 1 4 18 V6 A2 2 0 0 1 6 4 H14" />
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

const ROLE_SHORT: Record<string, string> = { admin_principal: "Superadmin", admin_local: "Responsable d'antenne", resp_distribution: "Resp. Distribution", logisticien: "Logisticien" };

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; role: string; avatar: string | null }>({ name: "", role: "", avatar: null });
  const { ready, cities, city, isAll, canSwitch, select } = useCity();
  const [cityMenu, setCityMenu] = useState(false);
  const [lateDist, setLateDist] = useState(0); // distributions not closed after D-day
  const NATIONAL_BG = "linear-gradient(120deg,#2a78d6,#7C5CD9 45%,#eb6834)";
  // only Dashboard and Fleet exist in the national view (all cities)
  // Superadmin: everything · Responsable d'antenne: Distribution, Stock, Planning · Resp. Distribution: Distribution only
  const rolePaths: string[] | null = me.role === "admin_local" ? ["/distributions", "/stock", "/planning", "/profil"] : me.role === "resp_distribution" ? ["/distributions", "/profil"] : null;
  const visibleNav = (isAll ? NAV_ITEMS.filter((n) => ["/dashboard", "/flotte", "/profil"].includes(n.href)) : NAV_ITEMS).filter((n) => (me.role ? !rolePaths || rolePaths.includes(n.href) : false));

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      let res = await supabase.from("profiles").select("full_name,email,role,avatar_key").eq("id", auth.user.id).maybeSingle();
      if (res.error) res = (await supabase.from("profiles").select("full_name,email,role").eq("id", auth.user.id).maybeSingle()) as typeof res; // before migration 006
      const p = res.data as { full_name: string | null; email: string | null; role: string; avatar_key?: string | null } | null;
      if (p) setMe({ name: p.full_name || p.email?.split("@")[0] || "", role: p.role, avatar: p.avatar_key && p.avatar_key in AVATAR_DEFS ? p.avatar_key : null });
    })();
  }, []);

  useEffect(() => {
    if (!city?.id || isAll) return setLateDist(0);
    countLateDistributions(createClient(), city.id).then(setLateDist).catch(() => setLateDist(0));
  }, [city?.id, isAll, pathname]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[236px] flex-none flex-col justify-between bg-[var(--navy-deep)] px-[18px] py-[26px] text-[var(--panel-fg)]">
      <div>
        <div className="flex items-center justify-between px-1.5 pb-[26px]">
          <div className="flex items-end gap-0.5">
            <span className="font-script text-2xl">linkee</span>
            <svg width="30" height="11" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1">
              <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
            </svg>
          </div>
          <NotificationBell dark />
        </div>

        {/* big city selector: solid colour of the city you are browsing */}
        {ready && (
          <div className="relative mb-5">
            <button
              type="button"
              disabled={!canSwitch}
              onClick={() => setCityMenu((v) => !v)}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left shadow-[0_10px_24px_-12px_rgba(0,0,0,0.7)] disabled:cursor-default"
              style={{ background: isAll ? NATIONAL_BG : (city?.color ?? "var(--slate)"), color: isAll ? "#fff" : textOn(city?.color ?? "#4D5C7A") }}
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/25">
                {isAll ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M3.5 12 H20.5 M12 3.5 C 8 8, 8 16, 12 20.5 C 16 16, 16 8, 12 3.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" />
                    <circle cx="12" cy="9.5" r="2.3" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9.5px] font-bold tracking-[0.08em] uppercase opacity-80">{isAll ? "Vue nationale" : "Ville affichée"}</span>
                <span className="block truncate font-display text-[21px] leading-tight font-black">{isAll ? "Toutes les villes" : (city?.name ?? "—")}</span>
              </span>
              {canSwitch && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 flex-none transition-transform ${cityMenu ? "rotate-180" : ""}`}>
                  <path d="M6 9 L12 15 L18 9" />
                </svg>
              )}
            </button>
            {cityMenu && canSwitch && (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--navy)] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]">
                {cities.map((c) => {
                  const on = !isAll && city?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        select(c.id);
                        setCityMenu(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[14px] font-bold hover:bg-[var(--input-bg)] ${on ? "bg-[var(--track)]" : ""}`}
                    >
                      <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: c.color }} />
                      <span className="flex-1">{c.name}</span>
                      {on && <span className="text-[var(--good)]">✓</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    select("all");
                    setCityMenu(false);
                  }}
                  className={`flex w-full items-center gap-2.5 border-t border-[var(--border)] px-3.5 py-3 text-left text-[14px] font-bold hover:bg-[var(--input-bg)] ${isAll ? "bg-[var(--track)]" : ""}`}
                >
                  <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: NATIONAL_BG }} />
                  <span className="flex-1">
                    Toutes les villes
                    <span className="block text-[10.5px] font-medium text-[var(--slate)]">Stats nationales · tableau de bord et flotte</span>
                  </span>
                  {isAll && <span className="text-[var(--good)]">✓</span>}
                </button>
              </div>
            )}
          </div>
        )}

        <nav className="flex flex-col gap-[3px]">
          {visibleNav.map((item) => {
            const active = pathname === item.href || (item.href === "/distributions" && pathname.startsWith("/distributions"));
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
                <span className="flex-1">{item.label}</span>
                {item.href === "/distributions" && lateDist > 0 && (
                  <span title="Distributions à clôturer" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--critical)] px-1.5 text-[11px] font-bold text-white">{lateDist}</span>
                )}
              </Link>
            );
          })}
          {me.role === "admin_principal" && (
            <>
          <div className="my-2.5 h-px bg-white/12" />
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--panel-fg-dim)]">
            Superadmin
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
          <Link
            href="/historique"
            className={`flex items-center gap-[11px] rounded-xl px-3 py-[11px] text-sm font-semibold ${
              pathname === "/historique" ? "bg-[var(--turquoise)] text-[#04262e]" : "text-[var(--panel-fg-dim)] hover:bg-white/8 hover:text-[var(--panel-fg)]"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] flex-none">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5 V12 L15 14" />
            </svg>
            <span>Historique &amp; sauvegardes</span>
          </Link>
            </>
          )}
        </nav>
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
          {me.avatar ? (
            <span className="flex h-[34px] w-[34px] flex-none overflow-hidden rounded-full" dangerouslySetInnerHTML={{ __html: critterSvg(me.avatar as AvatarKey) }} />
          ) : (
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[var(--turquoise)] font-display text-sm font-bold text-[#04262e]">
              {(me.name || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13.5px] font-bold text-[var(--panel-fg)]">{me.name || "…"}</span>
            <span className="block text-[11.5px] text-[var(--panel-fg-dim)]">{ROLE_SHORT[me.role] ?? ""}</span>
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
