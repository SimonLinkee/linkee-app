"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import BetaBadge from "@/components/BetaBadge";
import { countLateDistributions } from "@/lib/distributions";
import { isoOf } from "@/lib/stats";
import { useRemonteeAppBadge, useRemonteeBadge } from "@/lib/remontees";

type Counts = {
  cerfa: number;
  distrib: number;
  todoOpen: number;
  todoLate: number;
  planningTotal: number;
  planningDone: number;
  partners: number;
  beneficiaries: number;
  linksRunning: number;
  linksWaiting: number;
};
const ZERO: Counts = { cerfa: 0, distrib: 0, todoOpen: 0, todoLate: 0, planningTotal: 0, planningDone: 0, partners: 0, beneficiaries: 0, linksRunning: 0, linksWaiting: 0 };

const ico = (d: ReactNode) => d;
type Tile = { href: string; title: string; sub: (c: Counts, extra: { remontees: number }) => string; bg: string; fg: string; icon: ReactNode };

const TILES: Tile[] = [
  { href: "/mobile/planning", title: "Planning", sub: (c) => (c.planningTotal ? `${c.planningTotal} arrêt${c.planningTotal > 1 ? "s" : ""}, ${c.planningDone} fait${c.planningDone > 1 ? "s" : ""}` : "Aucun arrêt aujourd'hui"), bg: "#4fc1d6", fg: "#04262e", icon: ico(<><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9.5 H20.5 M8 3 V6.5 M16 3 V6.5" /></>) },
  { href: "/saisie-mobile", title: "Distribution", sub: (c) => (c.distrib ? `${c.distrib} à clôturer` : "Chiffres, kilos, photos"), bg: "#2a78d6", fg: "#ffffff", icon: ico(<><path d="M5 9 H19 L17.5 19 H6.5 Z" /><path d="M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" /></>) },
  { href: "/mobile/fiches", title: "Partenaires", sub: (c) => `${c.partners} fiche${c.partners > 1 ? "s" : ""}`, bg: "#0a1a3f", fg: "#fdf4ed", icon: ico(<><path d="M4 8 L8 4 H16 L20 8" /><rect x="4" y="8" width="16" height="12" rx="1.5" /><path d="M10 20 V14 H14 V20" /></>) },
  { href: "/mobile/fiches?tab=beneficiaire", title: "Bénéficiaires", sub: (c) => `${c.beneficiaries} association${c.beneficiaries > 1 ? "s" : ""}`, bg: "#1a8f68", fg: "#ffffff", icon: ico(<><circle cx="8" cy="8" r="2.6" /><circle cx="17" cy="9" r="2.2" /><path d="M3 19 C 3.4 15.5 5.4 13.6 8 13.6 C 10.6 13.6 12.6 15.5 13 19" /><path d="M14.2 14.2 C 15.2 13.5 16.1 13.4 17 13.4 C 19 13.4 20.4 15 20.8 18.5" /></>) },
  { href: "/mobile/stock", title: "Stock", sub: () => "Entrées et sorties", bg: "#eda100", fg: "#2b1c00", icon: ico(<><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M4 9.5 H20 M4 14.5 H20" /></>) },
  { href: "/mobile/flotte", title: "Flotte", sub: () => "Véhicules", bg: "#6b7a99", fg: "#ffffff", icon: ico(<><path d="M4 17 V9.5 L6.5 5 H15 L18 9.5 H20.5 L23 13 V17" /><path d="M1 17 H23" /><circle cx="7" cy="17" r="2.2" /><circle cx="17" cy="17" r="2.2" /></>) },
  { href: "/mobile/todo", title: "TODO", sub: (c) => (c.todoOpen ? `${c.todoOpen} ouverte${c.todoOpen > 1 ? "s" : ""}` : "Rien d'ouvert"), bg: "#0f6e56", fg: "#ffffff", icon: ico(<><path d="M9 11 L12 14 L20 6" /><path d="M20 12 V18 A2 2 0 0 1 18 20 H6 A2 2 0 0 1 4 18 V6 A2 2 0 0 1 6 4 H14" /></>) },
  { href: "/mobile/cerfa", title: "Cerfa", sub: (c) => (c.cerfa ? `${c.cerfa} à valider` : "Reçus fiscaux"), bg: "#7C5CD9", fg: "#ffffff", icon: ico(<><path d="M7 3 H14 L19 8 V21 H7 Z" /><path d="M14 3 V8 H19" /><path d="M10 13 H16 M10 17 H14" /></>) },
  { href: "/mobile/links", title: "Links bénévoles", sub: (c) => (c.linksRunning || c.linksWaiting ? `${c.linksRunning} en cours${c.linksWaiting ? `, ${c.linksWaiting} en attente` : ""}` : "Aucun en cours"), bg: "#eb6834", fg: "#ffffff", icon: ico(<><path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></>) },
  { href: "/mobile/dashboard", title: "Tableau de bord", sub: () => "Chiffres clés", bg: "#185FA5", fg: "#ffffff", icon: ico(<><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" /><rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5" /><rect x="13" y="10" width="7.5" height="10.5" rx="1.5" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" /></>) },
];

const CHAT = <><path d="M4 5.5 A2 2 0 0 1 6 3.5 H18 A2 2 0 0 1 20 5.5 V15 A2 2 0 0 1 18 17 H10 L5 21 V17 H6 A2 2 0 0 1 4 15 Z" /><path d="M8.5 8.5 H15.5 M8.5 12 H13" /></>;
const ORG = <><rect x="9" y="3" width="6" height="5" rx="1.2" /><rect x="3" y="16" width="6" height="5" rx="1.2" /><rect x="15" y="16" width="6" height="5" rx="1.2" /><path d="M12 8 V12 M6 16 V12 H18 V16" /></>;
const PROFIL = <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20 C 5.5 15.5, 8.3 13.3, 12 13.3 C 15.7 13.3, 18.5 15.5, 19.5 20" /></>;

/** Accueil mobile (Superadmin, Comptabilité, Responsable d'antenne — ce dernier pour sa ville) : « À faire maintenant »
 * puis les tuiles d'accès, chacune avec une info utile. Les chiffres sont ceux de la ville affichée. */
export default function MobileHome() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city, role } = useCity();
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [loaded, setLoaded] = useState(false);
  const isSuperadmin = role === "admin_principal";
  const myRemontees = useRemonteeBadge();
  const unseenRemontees = useRemonteeAppBadge(isSuperadmin);
  const remontees = isSuperadmin ? unseenRemontees : myRemontees;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("full_name,email").eq("id", data.user.id).maybeSingle();
      setName(((p?.full_name || p?.email?.split("@")[0] || "") as string).split(" ")[0]);
    });
  }, [supabase]);

  useEffect(() => {
    if (!cityId) return;
    let alive = true;
    const today = isoOf(new Date());
    Promise.all([
      supabase.from("partners").select("id", { count: "exact", head: true }).eq("city_id", cityId).is("deleted_at", null).eq("active", true),
      supabase.from("beneficiaries").select("id", { count: "exact", head: true }).eq("city_id", cityId).is("deleted_at", null),
      supabase.from("cerfa_requests").select("id", { count: "exact", head: true }).eq("city_id", cityId).eq("status", "soumise"),
      supabase.from("collectes").select("status,kind").eq("city_id", cityId).eq("scheduled_date", today).neq("kind", "pause").limit(500),
      supabase.from("links").select("status").eq("city_id", cityId).in("status", ["proposee", "acceptee", "collectee"]).limit(500),
      supabase.from("missions").select("status,deadline").eq("city_id", cityId).neq("status", "fait").limit(500),
      countLateDistributions(supabase, cityId).catch(() => 0),
    ]).then(([partners, beneficiaries, cerfa, col, links, missions, distrib]) => {
      if (!alive) return;
      const colRows = ((col.data ?? []) as { status: string }[]).filter((r) => r.status !== "annule");
      const linkRows = (links.data ?? []) as { status: string }[];
      const missionRows = (missions.data ?? []) as { deadline: string | null }[];
      setCounts({
        partners: partners.count ?? 0,
        beneficiaries: beneficiaries.count ?? 0,
        cerfa: cerfa.count ?? 0,
        planningTotal: colRows.length,
        planningDone: colRows.filter((r) => r.status === "collecte").length,
        linksRunning: linkRows.filter((r) => r.status !== "proposee").length,
        linksWaiting: linkRows.filter((r) => r.status === "proposee").length,
        todoOpen: missionRows.length,
        todoLate: missionRows.filter((r) => r.deadline && r.deadline < today).length,
        distrib,
      });
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [supabase, cityId]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const todo: { key: string; href: string; color: string; text: string }[] = [];
  if (counts.cerfa > 0) todo.push({ key: "cerfa", href: "/mobile/cerfa", color: "#7C5CD9", text: `${counts.cerfa} Cerfa à valider` });
  if (counts.distrib > 0) todo.push({ key: "distrib", href: "/saisie-mobile", color: "#2a78d6", text: `${counts.distrib} distribution${counts.distrib > 1 ? "s" : ""} à clôturer` });
  if (counts.todoOpen > 0) todo.push({ key: "todo", href: "/mobile/todo", color: "#0a1a3f", text: `${counts.todoOpen} TODO ouverte${counts.todoOpen > 1 ? "s" : ""}${counts.todoLate ? `, dont ${counts.todoLate} en retard` : ""}` });
  if (counts.linksWaiting > 0) todo.push({ key: "links", href: "/mobile/links", color: "#eb6834", text: `${counts.linksWaiting} Link${counts.linksWaiting > 1 ? "s" : ""} en attente d'un Linker` });
  if (remontees > 0) todo.push({ key: "rem", href: isSuperadmin ? "/mobile/remontees-app" : "/mobile/remontees", color: "#B23B72", text: isSuperadmin ? `${remontees} remontée${remontees > 1 ? "s" : ""} à ouvrir` : `${remontees} réponse${remontees > 1 ? "s" : ""} à tes remontées` });

  const tiles: Tile[] = [
    ...TILES,
    isSuperadmin
      ? { href: "/mobile/remontees-app", title: "Remontées APP", sub: (_c, x) => (x.remontees ? `${x.remontees} à ouvrir` : "Bugs et idées"), bg: "#B23B72", fg: "#ffffff", icon: CHAT }
      : { href: "/mobile/remontees", title: "Remontées", sub: (_c, x) => (x.remontees ? `${x.remontees} réponse${x.remontees > 1 ? "s" : ""}` : "Bug, question, idée"), bg: "#B23B72", fg: "#ffffff", icon: CHAT },
    { href: "/mobile/organigramme", title: "Organigramme", sub: () => "Qui fait quoi", bg: "#3a4a6b", fg: "#ffffff", icon: ORG },
    { href: "/mobile/profil", title: "Profil", sub: () => "Ton compte", bg: "#5b6785", fg: "#ffffff", icon: PROFIL },
  ];

  return (
    <div>
      <h1 className="font-display text-[26px] leading-tight font-black text-[var(--navy)]">Bonjour{name ? ` ${name}` : ""}</h1>
      <p className="mb-3.5 text-[13px] text-[var(--slate)]">L&apos;essentiel{city?.name ? ` — ${city.name}` : ""}.</p>

      <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-[var(--shadow)]">
        <p className="mb-1 text-[11px] font-bold tracking-[0.05em] text-[var(--slate)] uppercase">À faire maintenant</p>
        {!loaded ? (
          <p className="py-1.5 text-[13px] text-[var(--slate)]">Chargement…</p>
        ) : todo.length === 0 ? (
          <p className="py-1.5 text-[13px] text-[var(--slate)]">Rien d&apos;urgent pour l&apos;instant.</p>
        ) : (
          todo.map((t, i) => (
            <Link key={t.key} href={t.href} className={`flex items-center gap-2.5 py-2.5 text-[14px] font-semibold text-[var(--navy)] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: t.color }} />
              <span className="min-w-0 flex-1">{t.text}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none text-[var(--slate)]"><path d="M9 5 L16 12 L9 19" /></svg>
            </Link>
          ))
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="flex min-h-[96px] flex-col justify-between rounded-[18px] px-3.5 py-3 shadow-[var(--shadow)] active:scale-[0.98]" style={{ background: t.bg, color: t.fg }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">{t.icon}</svg>
            <span>
              <span className="flex items-center gap-1.5 font-display text-[17px] leading-tight font-black">{t.title}{t.href === "/mobile/links" && <BetaBadge onDark />}</span>
              <span className="mt-0.5 block text-[11.5px] leading-[1.3] opacity-90">{t.sub(counts, { remontees })}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-7 flex items-center justify-center gap-6 text-[13px] font-semibold text-[var(--slate)]">
        <Link href="/dashboard" className="underline">Version PC</Link>
        <button type="button" onClick={logout} className="underline">Se déconnecter</button>
      </div>
    </div>
  );
}
