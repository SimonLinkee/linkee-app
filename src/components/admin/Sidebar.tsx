"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_DEFS, critterSvg, type AvatarKey } from "@/lib/avatars";
import NotificationBell from "@/components/NotificationBell";
import BetaBadge from "@/components/BetaBadge";
import { useCity } from "@/components/admin/CityContext";
import { countLateDistributions } from "@/lib/distributions";
import { useRemonteeAppBadge, useRemonteeBadge } from "@/lib/remontees";
import { useMyPhoto } from "@/lib/profilePhoto";
import { useNavActivity } from "@/lib/navActivity";
import { isSuper } from "@/lib/roles";

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
    href: "/calendrier",
    label: "Calendrier et actu",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
        <path d="M3.5 9.5 H20.5 M8 3 V6.5 M16 3 V6.5" />
        <circle cx="8.5" cy="13.5" r="1" fill="currentColor" />
        <circle cx="12" cy="13.5" r="1" fill="currentColor" />
        <circle cx="15.5" cy="13.5" r="1" fill="currentColor" />
        <circle cx="8.5" cy="17" r="1" fill="currentColor" />
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
    href: "/prospection",
    label: "Prospection",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </>
    ),
  },
  {
    href: "/village-associatif",
    label: "Village associatif",
    icon: (
      <>
        <path d="M3 20 V11 L8 7 L13 11 V20" />
        <path d="M13 20 V13 L17.5 9.5 L22 13 V20" />
        <path d="M2 20 H23 M7 20 V15 H9 V20" />
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
    href: "/comptabilite",
    label: "Cerfa",
    icon: (
      <>
        <path d="M7 3 H14 L19 8 V21 H7 Z" />
        <path d="M14 3 V8 H19" />
        <path d="M10 13 H16 M10 17 H14" />
      </>
    ),
  },
  {
    href: "/links-benevoles",
    label: "Link citoyen",
    icon: (
      <>
        <circle cx="8" cy="8" r="2.6" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M3 19 C 3.4 15.5 5.4 13.6 8 13.6 C 10.6 13.6 12.6 15.5 13 19" />
        <path d="M14.2 14.2 C 15.2 13.5 16.1 13.4 17 13.4 C 19 13.4 20.4 15 20.8 18.5" />
      </>
    ),
  },
  {
    href: "/valeur-des-dons",
    label: "Valeur des dons",
    icon: (
      <>
        <path d="M6 3 V21 M18 3 V21" />
        <path d="M4 8 H8 M16 8 H20 M4 13 H8 M16 13 H20 M4 18 H8 M16 18 H20" />
      </>
    ),
  },
  {
    href: "/organigramme",
    label: "Organigramme",
    icon: (
      <>
        <rect x="9" y="3" width="6" height="5" rx="1.2" />
        <rect x="3" y="16" width="6" height="5" rx="1.2" />
        <rect x="15" y="16" width="6" height="5" rx="1.2" />
        <path d="M12 8 V12 M6 16 V12 H18 V16" />
      </>
    ),
  },
  {
    href: "/remontees",
    label: "Remontées",
    accent: true,
    icon: (
      <>
        <path d="M4 5.5 A2 2 0 0 1 6 3.5 H18 A2 2 0 0 1 20 5.5 V15 A2 2 0 0 1 18 17 H10 L5 21 V17 H6 A2 2 0 0 1 4 15 Z" />
        <path d="M8.5 8.5 H15.5 M8.5 12 H13" />
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

// Raccourcis tout en haut (entre le compte et le choix de la ville), qui clignotent quand il y a du nouveau
const PINNED = ["/calendrier", "/todo"];
// Groupes d'onglets, séparés par un trait discret : pilotage · opérations de terrain · réseau de partenaires · équipe
const NAV_GROUPS: string[][] = [
  ["/dashboard", "/valeur-des-dons"],
  ["/planning", "/distributions", "/stock", "/flotte", "/links-benevoles"],
  ["/partenaires", "/prospection", "/village-associatif", "/comptabilite"],
  ["/organigramme", "/remontees", "/profil"],
];
type NavItem = (typeof NAV_ITEMS)[number];

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

const ROLE_SHORT: Record<string, string> = { admin_principal: "Superadmin", comptabilite: "Comptabilité", admin_local: "Responsable d'antenne", resp_distribution: "Resp. Distribution", resp_rh: "Responsable RH", logisticien: "Logisticien" };

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
  // Superadmin, Comptabilité et Responsable d'antenne (pour sa ville) voient tout le menu ; la section "Superadmin"
  // (Villes & comptes, Historique) ne s'affiche que pour le Superadmin.
  const rolePaths: string[] | null = me.role === "resp_distribution" ? ["/calendrier", "/distributions", "/village-associatif", "/organigramme", "/profil", "/remontees"] : me.role === "resp_rh" ? ["/calendrier", "/organigramme", "/profil", "/remontees"] : null;
  // « Remontées » : onglet utilisateur pour tous les rôles sauf le Superadmin, qui a « Remontées APP » à la place
  const visibleNav = (isAll ? NAV_ITEMS.filter((n) => ["/dashboard", "/calendrier", "/flotte", "/profil", "/valeur-des-dons", "/comptabilite", "/organigramme", "/remontees"].includes(n.href)) : NAV_ITEMS)
    .filter((n) => (me.role ? !rolePaths || rolePaths.includes(n.href) : false))
    .filter((n) => n.href !== "/remontees" || me.role !== "admin_principal");
  const activity = useNavActivity(pathname, city?.id ?? null, isAll, me.role);
  const byHref = new Map<string, NavItem>(visibleNav.map((n) => [n.href, n]));
  const pinnedItems = PINNED.map((h) => byHref.get(h)).filter((x): x is NavItem => !!x);
  const placed = new Set<string>([...PINNED, ...NAV_GROUPS.flat()]);
  const groups = [...NAV_GROUPS.map((g) => g.map((h) => byHref.get(h)).filter((x): x is NavItem => !!x)), visibleNav.filter((n) => !placed.has(n.href))].filter((g) => g.length > 0);
  const remonteeBadge = useRemonteeBadge();
  const myPhoto = useMyPhoto();
  const unseenRemontees = useRemonteeAppBadge(me.role === "admin_principal");

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

  function renderItem(item: NavItem) {
        const active = pathname === item.href || pathname.startsWith(item.href + "/") || (item.href === "/links-benevoles" && pathname.startsWith("/linker"));
        const fresh = item.href === "/calendrier" ? activity.calendar : item.href === "/todo" ? activity.todo : 0; // nouveautés des autres depuis ta dernière visite
        return (
          <Link
            key={item.href}
            href={item.href}
            style={"accent" in item && item.accent ? (active ? { background: "#B23B72", color: "#fff" } : { color: "#F09BBE" }) : undefined}
            title={fresh > 0 ? `${fresh} nouveauté${fresh > 1 ? "s" : ""} depuis ta dernière visite` : undefined}
            className={`flex items-center gap-[11px] rounded-xl px-3 py-2 text-sm font-semibold ${fresh > 0 && !active ? "nav-blink " : ""}${
              "accent" in item && item.accent
                ? active ? "" : "hover:bg-white/8"
                : active
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
            {fresh > 0 && !active && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--turquoise)] px-1.5 text-[11px] font-bold text-[#04262e]">{fresh}</span>}
            {item.href === "/links-benevoles" && <BetaBadge onDark={!active} className={active ? "ring-1 ring-[#04262e]/40" : ""} />}
            {item.href === "/remontees" && remonteeBadge > 0 && (
              <span title="Nouvelles réponses" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B23B72] px-1.5 text-[11px] font-bold text-white ring-1 ring-white/70">{remonteeBadge}</span>
            )}
            {item.href === "/distributions" && lateDist > 0 && (
              <span title="Distributions à clôturer" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--critical)] px-1.5 text-[11px] font-bold text-white">{lateDist}</span>
            )}
          </Link>
        );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[236px] flex-none flex-col bg-[var(--navy-deep)] px-[18px] py-5 text-[var(--panel-fg)]">
      <div className="flex flex-none items-center justify-between px-1.5">
        <div className="flex items-end gap-0.5">
          <span className="font-script text-2xl">linkee</span>
          <svg width="30" height="11" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1">
            <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
          </svg>
        </div>
        <NotificationBell dark />
      </div>

      {/* avatar + déconnexion : toujours visibles en haut, plus jamais coupés en bas sur un écran bas */}
      <div className="mt-3.5 mb-3.5 flex flex-none items-center gap-2.5 rounded-xl px-1.5 py-1.5">
        {myPhoto.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={myPhoto.url} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
        ) : me.avatar ? (
          <span className="flex h-10 w-10 flex-none overflow-hidden rounded-full" dangerouslySetInnerHTML={{ __html: critterSvg(me.avatar as AvatarKey) }} />
        ) : (
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--turquoise)] font-display text-[15px] font-bold text-[#04262e]">
            {(me.name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13.5px] font-bold text-[var(--panel-fg)]">{me.name || "…"}</span>
          <span className="block text-[11px] text-[var(--panel-fg-dim)]">{ROLE_SHORT[me.role] ?? ""}</span>
        </span>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Déconnexion"
          title="Déconnexion"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--panel-fg-dim)] hover:bg-white/10 hover:text-[var(--panel-fg)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
            <path d="M9 4 H6 a1.5 1.5 0 0 0 -1.5 1.5 v13 A1.5 1.5 0 0 0 6 20 h3" />
            <path d="M15 16 L20 12 L15 8" />
            <path d="M20 12 H9" />
          </svg>
        </button>
      </div>

      {pinnedItems.length > 0 && <div className="mb-3.5 flex flex-none flex-col gap-[2px]">{pinnedItems.map((item) => renderItem(item))}</div>}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* big city selector: solid colour of the city you are browsing */}
        {ready && (
          <div className="relative mb-4 flex-none">
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

        <nav className="flex flex-none flex-col gap-[2px]">
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-[2px]">
              {gi > 0 && <div className="mx-3 my-1.5 h-px bg-white/10" aria-hidden="true" />}
              {g.map((item) => renderItem(item))}
            </div>
          ))}
          {me.role === "admin_principal" && (
            <>
          <div className="my-2 h-px bg-white/12" />
          <div className="px-3 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--panel-fg-dim)]">
            Superadmin
          </div>
          <Link
            href={SUPER_ITEM.href}
            className={`flex items-center gap-[11px] rounded-xl px-3 py-2 text-sm font-semibold ${
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
            className={`flex items-center gap-[11px] rounded-xl px-3 py-2 text-sm font-semibold ${
              pathname === "/historique" ? "bg-[var(--turquoise)] text-[#04262e]" : "text-[var(--panel-fg-dim)] hover:bg-white/8 hover:text-[var(--panel-fg)]"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] flex-none">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5 V12 L15 14" />
            </svg>
            <span>Historique &amp; sauvegardes</span>
          </Link>
          <Link
            href="/remontees-app"
            style={pathname === "/remontees-app" ? { background: "#B23B72", color: "#fff" } : { color: "#F09BBE" }}
            className={`flex items-center gap-[11px] rounded-xl px-3 py-2 text-sm font-semibold ${pathname === "/remontees-app" ? "" : "hover:bg-white/8"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] flex-none">
              <path d="M4 5.5 A2 2 0 0 1 6 3.5 H18 A2 2 0 0 1 20 5.5 V15 A2 2 0 0 1 18 17 H10 L5 21 V17 H6 A2 2 0 0 1 4 15 Z" />
              <path d="M8.5 8.5 H15.5 M8.5 12 H13" />
            </svg>
            <span className="flex-1">Remontées APP</span>
            {unseenRemontees > 0 && <span title="Remontées non ouvertes" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B23B72] px-1.5 text-[11px] font-bold text-white ring-1 ring-white/70">{unseenRemontees}</span>}
          </Link>
            </>
          )}
        </nav>
      </div>

      {/* outils externes : s'ouvrent dans un nouvel onglet (PayFit et Axonaut refusent d'être affichés dans une autre page) */}
      {me.role && (
        <div className="mt-3 flex flex-none flex-col gap-1.5 border-t border-white/10 pt-3">
          {[
            { href: "https://payfit.com/fr/", label: "Ma RH", sub: "PayFit", show: true },
            { href: "https://axonaut.com/", label: "Facturation", sub: "Axonaut", show: isSuper(me.role) },
          ]
            .filter((x) => x.show)
            .map((x) => (
              <a key={x.href} href={x.href} target="_blank" rel="noopener noreferrer" title={`${x.label} — ${x.sub} (s'ouvre dans un nouvel onglet)`} className="flex items-center justify-between gap-2 rounded-full border border-white/25 px-4 py-1.5 text-[12.5px] font-bold text-[var(--panel-fg)] hover:border-[var(--turquoise)] hover:bg-white/8">
                <span>{x.label}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-none opacity-80" aria-hidden="true">
                  <path d="M14 4 H20 V10 M20 4 L11 13 M18 14 V19 A1 1 0 0 1 17 20 H5 A1 1 0 0 1 4 19 V7 A1 1 0 0 1 5 6 H10" />
                </svg>
              </a>
            ))}
        </div>
      )}
    </aside>
  );
}
