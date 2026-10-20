"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_DEFS, critterSvg, type AvatarKey } from "@/lib/avatars";
import NotificationBell from "@/components/NotificationBell";
import PresenceBar from "@/components/PresenceBar";
import BetaBadge from "@/components/BetaBadge";
import { useCity } from "@/components/admin/CityContext";
import { SUPER_ITEM, navFor, type NavItem } from "@/components/admin/Sidebar";
import { countLateDistributions } from "@/lib/distributions";
import { useRemonteeAppBadge, useRemonteeBadge } from "@/lib/remontees";
import { useMyPhoto } from "@/lib/profilePhoto";
import { useNavActivity } from "@/lib/navActivity";
import { isSuper } from "@/lib/roles";

// Nouveau menu (proposition A) : la barre du haut porte les raccourcis et les outils, le menu de gauche ne garde que le travail
// (Planning, Distributions, Partenaires en grand, puis des groupes repliables).

const PRIORITY = ["/planning", "/distributions", "/partenaires"];
const GROUPS: { key: string; label: string; hrefs: string[] }[] = [
  { key: "coll", label: "Collecte et logistique", hrefs: ["/stock", "/flotte", "/links-benevoles"] },
  { key: "res", label: "Réseau", hrefs: ["/prospection", "/village-associatif", "/comptabilite"] },
  { key: "pil", label: "Pilotage", hrefs: ["/valeur-des-dons"] },
];
const SHORTCUTS = ["/calendrier", "/todo", "/documents-utiles"]; // icônes de la barre du haut
const NATIONAL_BG = "linear-gradient(120deg,#2a78d6,#7C5CD9 45%,#eb6834)";
const PRESENCE_ROLES = ["admin_principal", "comptabilite", "admin_local", "resp_distribution", "resp_rh"];
const ROLE_SHORT: Record<string, string> = { admin_principal: "Superadmin", comptabilite: "Comptabilité", admin_local: "Responsable d'antenne", resp_distribution: "Resp. Distribution", resp_rh: "Responsable RH", logisticien: "Logisticien" };

function textOn(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#04162e" : "#ffffff";
}
const Svg = ({ children, className = "h-[18px] w-[18px] flex-none" }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
);
const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/") || (href === "/links-benevoles" && path.startsWith("/linker"));

/* ---------------------------------- menu de gauche ---------------------------------- */
export function SidebarV2() {
  const pathname = usePathname();
  const { role, city, isAll } = useCity();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [lateDist, setLateDist] = useState(0);
  const unseenApp = useRemonteeAppBadge(role === "admin_principal");

  useEffect(() => {
    if (!city?.id || isAll) return;
    let off = false;
    countLateDistributions(createClient(), city.id).then((n) => !off && setLateDist(n)).catch(() => !off && setLateDist(0));
    return () => {
      off = true;
    };
  }, [city?.id, isAll, pathname]);

  const items = navFor(role);
  const by = new Map<string, NavItem>(items.map((n) => [n.href, n]));
  const home = by.get("/dashboard");
  const priority = PRIORITY.map((h) => by.get(h)).filter((x): x is NavItem => !!x);
  const groups = GROUPS.map((g) => ({ ...g, items: g.hrefs.map((h) => by.get(h)).filter((x): x is NavItem => !!x) })).filter((g) => g.items.length > 0);
  const superLinks = role === "admin_principal"
    ? [
        { href: SUPER_ITEM.href, label: SUPER_ITEM.label, icon: SUPER_ITEM.icon },
        { href: "/historique", label: "Historique & sauvegardes", icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5 V12 L15 14" /></> },
        { href: "/remontees-app", label: "Remontées APP", icon: <><path d="M4 5.5 A2 2 0 0 1 6 3.5 H18 A2 2 0 0 1 20 5.5 V15 A2 2 0 0 1 18 17 H10 L5 21 V17 H6 A2 2 0 0 1 4 15 Z" /><path d="M8.5 8.5 H15.5 M8.5 12 H13" /></> },
      ]
    : [];
  if (!home && priority.length === 0 && groups.length === 0 && superLinks.length === 0) return null;

  const row = (href: string, label: string, icon: ReactNode, extra?: ReactNode, big = false) => {
    const on = isActive(pathname, href);
    return (
      <Link key={href} href={href} className={`flex items-center gap-[11px] rounded-xl px-3 ${big ? "py-3 text-[14.5px] font-bold" : "py-2 text-sm font-semibold"} ${on ? "bg-[var(--turquoise)] text-[#04262e]" : big ? "bg-white/8 text-[var(--panel-fg)] hover:bg-white/14" : "text-[var(--panel-fg-dim)] hover:bg-white/8 hover:text-[var(--panel-fg)]"}`}>
        <Svg>{icon}</Svg>
        <span className="flex-1">{label}</span>
        {extra}
      </Link>
    );
  };
  const groupBlock = (key: string, label: string, links: { href: string; label: string; icon: ReactNode; extra?: ReactNode }[]) => {
    const hasActive = links.some((l) => isActive(pathname, l.href));
    const isOpen = open[key] ?? hasActive; // le groupe de la page ouverte est déplié d'office
    return (
      <div key={key} className="mt-1">
        <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[10.5px] font-bold tracking-[0.07em] text-[var(--panel-fg-dim)] uppercase hover:text-[var(--panel-fg)]">
          <span>{label}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true"><path d="M6 9 L12 15 L18 9" /></svg>
        </button>
        {isOpen && <div className="flex flex-col gap-[2px]">{links.map((l) => row(l.href, l.label, l.icon, l.extra))}</div>}
      </div>
    );
  };

  return (
    <aside className="sticky top-0 flex h-screen w-[232px] flex-none flex-col bg-[var(--navy-deep)] px-[14px] py-5 text-[var(--panel-fg)]">
      <div className="flex flex-none items-end gap-0.5 px-2">
        <span className="font-script text-2xl">linkee</span>
        <svg width="30" height="11" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1"><path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" /></svg>
      </div>
      <nav className="mt-5 flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto">
        {home && row(home.href, home.label, home.icon)}
        {(home && priority.length > 0) && <div className="mx-3 my-2 h-px bg-white/12" aria-hidden="true" />}
        <div className="flex flex-col gap-1.5">{priority.map((p) => row(p.href, p.label, p.icon, undefined, true))}</div>
        {groups.map((g) =>
          groupBlock(g.key, g.label, g.items.map((it) => ({
            href: it.href,
            label: it.label,
            icon: it.icon,
            extra: it.href === "/links-benevoles" ? <BetaBadge onDark /> : undefined,
          }))),
        )}
        {superLinks.length > 0 &&
          groupBlock("adm", "Superadmin", superLinks.map((l) => ({
            ...l,
            extra: l.href === "/remontees-app" && unseenApp > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B23B72] px-1.5 text-[11px] font-bold text-white">{unseenApp}</span> : undefined,
          })))}
        {lateDist > 0 && priority.some((p) => p.href === "/distributions") && (
          <Link href="/distributions" className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--critical)]/20 px-3 py-2 text-[12px] font-bold text-[var(--panel-fg)]">
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--critical)] px-1.5 text-[11px] text-white">{lateDist}</span>
            distribution{lateDist > 1 ? "s" : ""} à clôturer
          </Link>
        )}
      </nav>
    </aside>
  );
}

/* ---------------------------------- barre du haut ---------------------------------- */
function CitySwitcher() {
  const { ready, cities, city, isAll, canSwitch, select } = useCity();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!ready) return null;
  const bg = isAll ? NATIONAL_BG : (city?.color ?? "var(--slate)");
  const fg = isAll ? "#fff" : textOn(city?.color ?? "#4D5C7A");
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={!canSwitch} onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 rounded-2xl px-4 py-1.5 text-left shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)] disabled:cursor-default" style={{ background: bg, color: fg }} title={canSwitch ? "Changer de ville" : "Ta ville"}>
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/25">
          <Svg className="h-[18px] w-[18px] flex-none">{isAll ? <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12 H20.5 M12 3.5 C 8 8, 8 16, 12 20.5 C 16 16, 16 8, 12 3.5" /></> : <><path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></>}</Svg>
        </span>
        <span className="leading-tight">
          <span className="block text-[9.5px] font-bold tracking-[0.08em] uppercase opacity-80">{isAll ? "Vue nationale" : "Ville affichée"}</span>
          <span className="block font-display text-[19px] font-black">{isAll ? "Toutes les villes" : (city?.name ?? "—")}</span>
        </span>
        {canSwitch && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 flex-none transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9 L12 15 L18 9" /></svg>}
      </button>
      {open && canSwitch && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-50 w-[250px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--navy)] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]">
          {cities.map((c) => (
            <button key={c.id} type="button" onClick={() => { select(c.id); setOpen(false); }} className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-bold hover:bg-[var(--input-bg)] ${!isAll && city?.id === c.id ? "bg-[var(--track)]" : ""}`}>
              <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: c.color }} />
              <span className="flex-1">{c.name}</span>
              {!isAll && city?.id === c.id && <span className="text-[var(--good)]">✓</span>}
            </button>
          ))}
          <button type="button" onClick={() => { select("all"); setOpen(false); }} className={`flex w-full items-center gap-2.5 border-t border-[var(--border)] px-3.5 py-2.5 text-left text-[14px] font-bold hover:bg-[var(--input-bg)] ${isAll ? "bg-[var(--track)]" : ""}`}>
            <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: NATIONAL_BG }} />
            <span className="flex-1">Toutes les villes<span className="block text-[10.5px] font-medium text-[var(--slate)]">Stats nationales</span></span>
            {isAll && <span className="text-[var(--good)]">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBarV2() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, city, isAll } = useCity();
  const activity = useNavActivity(pathname, city?.id ?? null, isAll, role);
  const remonteeBadge = useRemonteeBadge();
  const myPhoto = useMyPhoto();
  const [me, setMe] = useState<{ name: string; avatar: string | null }>({ name: "", avatar: null });
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      let res = await supabase.from("profiles").select("full_name,email,avatar_key").eq("id", auth.user.id).maybeSingle();
      if (res.error) res = (await supabase.from("profiles").select("full_name,email").eq("id", auth.user.id).maybeSingle()) as typeof res;
      const p = res.data as { full_name: string | null; email: string | null; avatar_key?: string | null } | null;
      if (p) setMe({ name: p.full_name || p.email?.split("@")[0] || "", avatar: p.avatar_key && p.avatar_key in AVATAR_DEFS ? p.avatar_key : null });
    })();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const items = navFor(role);
  const by = new Map<string, NavItem>(items.map((n) => [n.href, n]));
  const shortcuts = SHORTCUTS.map((h) => by.get(h)).filter((x): x is NavItem => !!x);
  const menuItems = ["/profil", "/organigramme", "/remontees"].map((h) => by.get(h)).filter((x): x is NavItem => !!x);
  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };
  const fresh = (h: string) => (h === "/calendrier" ? activity.calendar : h === "/todo" ? activity.todo : 0);

  return (
    <header className="sticky top-0 z-40 flex flex-wrap items-center gap-2.5 border-b border-[var(--border)] bg-[var(--card)] px-[26px] py-2.5 shadow-[0_6px_16px_-14px_rgba(0,0,0,0.5)]">
      <CitySwitcher />
      <div className="flex-1" />
      {shortcuts.map((it) => {
        const on = isActive(pathname, it.href);
        const n = on ? 0 : fresh(it.href);
        return (
          <Link key={it.href} href={it.href} title={n > 0 ? `${it.label} — ${n} nouveauté${n > 1 ? "s" : ""}` : it.label} className={`relative flex h-[40px] items-center gap-2 rounded-full border px-4 text-[13.5px] font-bold ${on ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--navy)] hover:border-[var(--turquoise)]"} ${n > 0 ? "nav-blink" : ""}`}>
            <Svg>{it.icon}</Svg>
            <span>{it.label}</span>
            {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#eb6834] px-1.5 text-[11px] font-bold text-white">{n}</span>}
          </Link>
        );
      })}      <NotificationBell align="right" />
      {PRESENCE_ROLES.includes(role) && <PresenceBar channel="team" />}
      <div ref={box} className="relative">
        <button type="button" aria-expanded={menu} onClick={() => setMenu((v) => !v)} title={me.name || "Mon compte"} className="relative flex h-[44px] items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--card)] py-1 pr-3 pl-1 hover:border-[var(--turquoise)]"><span className="flex h-[36px] w-[36px] flex-none items-center justify-center overflow-hidden rounded-full bg-[var(--turquoise)] font-display text-[15px] font-bold text-[#04262e]">
          {myPhoto.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={myPhoto.url} alt="" className="h-full w-full object-cover" />
          ) : me.avatar ? (
            <span className="flex h-full w-full" dangerouslySetInnerHTML={{ __html: critterSvg(me.avatar as AvatarKey) }} />
          ) : (
            (me.name || "?").charAt(0).toUpperCase()
          )}</span>
          <span className="hidden text-left leading-tight 2xl:block">
            <span className="block max-w-[130px] truncate text-[13px] font-bold text-[var(--navy)]">{me.name || "Mon compte"}</span>
            <span className="block text-[10.5px] text-[var(--slate)]">{ROLE_SHORT[role] ?? ""}</span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[var(--slate)]" aria-hidden="true"><path d="M6 9 L12 15 L18 9" /></svg>
          {remonteeBadge > 0 && <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-[#B23B72] ring-2 ring-[var(--card)]" />}
        </button>
        {menu && (
          <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-[240px] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 text-[var(--navy)] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]">
            <div className="px-3 py-2">
              <div className="text-[14px] font-bold">{me.name || "—"}</div>
              <div className="text-[11.5px] text-[var(--slate)]">{ROLE_SHORT[role] ?? ""}</div>
            </div>
            <div className="my-1 h-px bg-[var(--border)]" />
            {menuItems.map((it) => (
              <Link key={it.href} href={it.href} onClick={() => setMenu(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold hover:bg-[var(--input-bg)]">
                <Svg>{it.icon}</Svg>
                <span className="flex-1">{it.href === "/profil" ? "Mon profil" : it.label}</span>
                {it.href === "/remontees" && remonteeBadge > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B23B72] px-1.5 text-[11px] font-bold text-white">{remonteeBadge}</span>}
              </Link>
            ))}
            {role && (
              <>
                <div className="my-1 h-px bg-[var(--border)]" />
                <a href="https://payfit.com/fr/" target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold hover:bg-[var(--input-bg)]">
                  <Svg><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20 C 5.5 15.5, 8.3 13.3, 12 13.3 C 15.7 13.3, 18.5 15.5, 19.5 20" /></Svg>
                  <span className="flex-1">Ma RH <span className="text-[11.5px] font-normal text-[var(--slate)]">PayFit</span></span>
                  <span aria-hidden="true" className="text-[var(--slate)]">↗</span>
                </a>
                {isSuper(role) && (
                  <a href="https://axonaut.com/" target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold hover:bg-[var(--input-bg)]">
                    <Svg><path d="M7 3 H14 L19 8 V21 H7 Z" /><path d="M14 3 V8 H19" /><path d="M10 13 H16 M10 17 H14" /></Svg>
                    <span className="flex-1">Facturation <span className="text-[11.5px] font-normal text-[var(--slate)]">Axonaut</span></span>
                    <span aria-hidden="true" className="text-[var(--slate)]">↗</span>
                  </a>
                )}
              </>
            )}
            <div className="my-1 h-px bg-[var(--border)]" />
            <button type="button" onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold hover:bg-[var(--input-bg)]">
              <Svg><path d="M9 4 H6 a1.5 1.5 0 0 0 -1.5 1.5 v13 A1.5 1.5 0 0 0 6 20 h3" /><path d="M15 16 L20 12 L15 8" /><path d="M20 12 H9" /></Svg>
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
