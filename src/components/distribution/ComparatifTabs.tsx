"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { canAdminCity, isSuper } from "@/lib/roles";

// Comparatif « Collecté vs Distribué » d'une distribution (migration 065) : onglets Distribué (tableau existant, inchangé),
// Collecté (collectes rattachées) et Comparatif (par catégorie), plus 4 chiffres clés en haut.
// Lecture : Superadmin, Comptabilité, Responsable d'antenne, Responsable distribution. Modification : tous sauf le Responsable
// distribution. Les règles sont appliquées par la base (RLS) ; ici on adapte seulement l'affichage.

const CATS = ["F&L", "Boulang", "Sec", "Frais", "Plats préparés", "Hygiène", "Autre"]; // mêmes catégories que la saisie de distribution
const DENREE_TO_CAT: Record<string, string> = { "Fruits et légumes": "F&L", Boulangerie: "Boulang", Secs: "Sec", "Produits frais": "Frais", "Plats préparés": "Plats préparés" };
const COLLECT_KINDS = ["partner", "exceptionnel", "demande_client"];

type Rel<T> = T | T[] | null;
const first = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
type SrcRow = {
  id: string;
  collecte_id: string | null;
  link_id: string | null;
  collectes: Rel<{ id: string; scheduled_date: string; partner_id: string | null; partners: Rel<{ name: string }>; collecte_items: { denree: string | null; name: string | null; kg: number | string | null }[] | null }>;
  links: Rel<{ id: string; window_date: string; weight_actual: number | string | null; kg_estime: number | string | null; denree: string | null; partner_id: string | null; partners: Rel<{ name: string }> }>;
};
type Flat = { key: string; srcId: string; lot: string; donor: string; donorId: string; cat: string; product: string; date: string; type: "pro" | "benevole"; kg: number };
type Cand = { key: string; kind: "collecte" | "link"; id: string; date: string; donor: string; kg: number };

const SRC_SELECT =
  "id,collecte_id,link_id,collectes(id,scheduled_date,partner_id,partners(name),collecte_items!collecte_id(denree,name,kg)),links(id,window_date,weight_actual,kg_estime,denree,partner_id,partners(name))";

const kgNum = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtKg = (n: number) => `${r1(n).toLocaleString("fr-FR")} kg`;
const fmtD = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Statut d'une catégorie : OK sous 5 % d'écart, « À vérifier » jusqu'à 20 %, « Alerte » au-delà (écart en valeur absolue, en % du collecté). */
export function gapStatus(collected: number, distributed: number): { label: "OK" | "À vérifier" | "Alerte"; pct: number | null } {
  if (collected <= 0) return distributed > 0 ? { label: "Alerte", pct: null } : { label: "OK", pct: null };
  const pct = (Math.abs(collected - distributed) / collected) * 100;
  return { label: pct < 5 ? "OK" : pct <= 20 ? "À vérifier" : "Alerte", pct };
}
const STATUS_UI = {
  OK: { bg: "var(--good-bg)", fg: "var(--good)" },
  "À vérifier": { bg: "var(--warn-bg)", fg: "var(--warn)" },
  Alerte: { bg: "var(--critical-bg)", fg: "var(--critical)" },
} as const;

export default function ComparatifTabs({
  distributionId,
  cityId,
  date,
  lines,
  role,
  ensureSaved,
  distribue,
}: {
  distributionId: string | null;
  cityId: string | null;
  date: string;
  lines: { category: string; weight_kg: string }[];
  role: string;
  ensureSaved: () => void;
  distribue: ReactNode;
}) {
  const canRead = isSuper(role) || role === "admin_local" || role === "resp_distribution";
  const canEdit = canAdminCity(role);
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<"distribue" | "collecte" | "comparatif">("distribue");
  const [sources, setSources] = useState<SrcRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ cands: Cand[]; sel: Set<string> } | null>(null);
  const prefillAsked = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!distributionId) return;
    const [s, n] = await Promise.all([
      supabase.from("distribution_sources").select(SRC_SELECT).eq("distribution_id", distributionId).order("created_at"),
      supabase.from("distribution_gap_notes").select("category,comment").eq("distribution_id", distributionId),
    ]);
    if (s.error) setErr("Chargement impossible : " + s.error.message + " (la migration 065 est-elle passée ?)");
    setSources((s.data ?? []) as unknown as SrcRow[]);
    setNotes(Object.fromEntries(((n.data ?? []) as { category: string; comment: string }[]).map((x) => [x.category, x.comment])));
    setLoaded(true);
  }, [supabase, distributionId]);

  // chargement + pré-remplissage automatique (une fois par distribution, quand le jour J est arrivé)
  useEffect(() => {
    if (!canRead || !distributionId) return;
    let off = false;
    (async () => {
      if (prefillAsked.current !== distributionId) {
        prefillAsked.current = distributionId;
        const { error } = await supabase.rpc("prefill_distribution_sources", { p_distribution: distributionId, p_force: false });
        if (error && !off) setErr("Rattachement automatique impossible : " + error.message);
      }
      if (!off) await load();
    })();
    return () => {
      off = true;
    };
  }, [canRead, distributionId, supabase, load]);

  // l'onglet Collecté / Comparatif a besoin d'une distribution enregistrée : on la crée si besoin
  function openTab(t: "distribue" | "collecte" | "comparatif") {
    setTab(t);
    if (t !== "distribue" && !distributionId) ensureSaved();
  }

  /* ---------- données à plat ---------- */
  const flat: Flat[] = useMemo(() => {
    const out: Flat[] = [];
    for (const s of sources) {
      const c = first(s.collectes);
      const l = first(s.links);
      if (c) {
        const donor = first(c.partners)?.name ?? "Partenaire";
        const items = (c.collecte_items ?? []).filter((i) => kgNum(i.kg) > 0);
        for (const [idx, it] of items.entries()) {
          out.push({ key: `${s.id}:${idx}`, srcId: s.id, lot: s.id, donor, donorId: c.partner_id ?? donor, cat: (it.denree && DENREE_TO_CAT[it.denree]) || "Autre", product: it.name || it.denree || "—", date: c.scheduled_date, type: "pro", kg: kgNum(it.kg) });
        }
        if (!items.length) out.push({ key: `${s.id}:0`, srcId: s.id, lot: s.id, donor, donorId: c.partner_id ?? donor, cat: "Autre", product: "(aucun détail saisi)", date: c.scheduled_date, type: "pro", kg: 0 });
      } else if (l) {
        const donor = first(l.partners)?.name ?? "Partenaire";
        out.push({ key: s.id, srcId: s.id, lot: s.id, donor, donorId: l.partner_id ?? donor, cat: (l.denree && DENREE_TO_CAT[l.denree]) || "Autre", product: l.denree || "Link bénévole", date: l.window_date, type: "benevole", kg: kgNum(l.weight_actual ?? l.kg_estime) });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.donor.localeCompare(b.donor));
  }, [sources]);

  const collectedBy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of flat) m[f.cat] = (m[f.cat] ?? 0) + f.kg;
    return m;
  }, [flat]);
  const distributedBy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) m[l.category || "Autre"] = (m[l.category || "Autre"] ?? 0) + kgNum(l.weight_kg);
    return m;
  }, [lines]);
  const cats = useMemo(() => {
    const all = Array.from(new Set([...CATS, ...Object.keys(collectedBy), ...Object.keys(distributedBy)]));
    return all.filter((c) => (collectedBy[c] ?? 0) > 0 || (distributedBy[c] ?? 0) > 0);
  }, [collectedBy, distributedBy]);

  const totalCollected = flat.reduce((a, f) => a + f.kg, 0);
  const totalDistributed = Object.values(distributedBy).reduce((a, b) => a + b, 0);
  const nLots = new Set(flat.map((f) => f.lot)).size;
  const nDonors = new Set(flat.map((f) => f.donorId)).size;
  const toJustify = cats.reduce((sum, c) => {
    const st = gapStatus(collectedBy[c] ?? 0, distributedBy[c] ?? 0).label;
    return st !== "OK" && !notes[c]?.trim() ? sum + Math.abs((collectedBy[c] ?? 0) - (distributedBy[c] ?? 0)) : sum;
  }, 0);

  /* ---------- actions (Superadmin, Comptabilité, Responsable d'antenne) ---------- */
  async function removeSource(srcId: string) {
    if (!window.confirm("Retirer cette collecte de la distribution ? Elle ne sera plus comptée dans le comparatif.")) return;
    const { error } = await supabase.from("distribution_sources").delete().eq("id", srcId);
    if (error) return setErr("Retrait impossible : " + error.message);
    await load();
  }
  async function openPicker() {
    if (!distributionId || !cityId) return;
    setErr(null);
    const from = addDays(date, -60);
    const to = addDays(date, 3);
    const [cs, ls, used] = await Promise.all([
      supabase.from("collectes").select("id,scheduled_date,partners(name),collecte_items!collecte_id(kg)").eq("city_id", cityId).eq("source", "planning").eq("status", "collecte").in("kind", COLLECT_KINDS).gte("scheduled_date", from).lte("scheduled_date", to).order("scheduled_date", { ascending: false }).limit(300),
      supabase.from("links").select("id,window_date,weight_actual,kg_estime,partners(name)").eq("city_id", cityId).eq("status", "livree").gte("window_date", from).lte("window_date", to).order("window_date", { ascending: false }).limit(300),
      supabase.from("distribution_sources").select("collecte_id,link_id"),
    ]);
    const usedC = new Set(((used.data ?? []) as { collecte_id: string | null }[]).map((u) => u.collecte_id).filter(Boolean));
    const usedL = new Set(((used.data ?? []) as { link_id: string | null }[]).map((u) => u.link_id).filter(Boolean));
    const cands: Cand[] = [
      ...((cs.data ?? []) as unknown as { id: string; scheduled_date: string; partners: Rel<{ name: string }>; collecte_items: { kg: number | string | null }[] | null }[]).filter((c) => !usedC.has(c.id)).map((c) => ({ key: "c" + c.id, kind: "collecte" as const, id: c.id, date: c.scheduled_date, donor: first(c.partners)?.name ?? "Partenaire", kg: (c.collecte_items ?? []).reduce((a, i) => a + kgNum(i.kg), 0) })),
      ...((ls.data ?? []) as unknown as { id: string; window_date: string; weight_actual: number | string | null; kg_estime: number | string | null; partners: Rel<{ name: string }> }[]).filter((l) => !usedL.has(l.id)).map((l) => ({ key: "l" + l.id, kind: "link" as const, id: l.id, date: l.window_date, donor: (first(l.partners)?.name ?? "Partenaire") + " (Link bénévole)", kg: kgNum(l.weight_actual ?? l.kg_estime) })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    setPick({ cands, sel: new Set() });
  }
  async function attachSelected() {
    if (!pick || !distributionId || pick.sel.size === 0) return;
    setBusy(true);
    const rows = pick.cands.filter((c) => pick.sel.has(c.key)).map((c) => ({ distribution_id: distributionId, ...(c.kind === "collecte" ? { collecte_id: c.id } : { link_id: c.id }) }));
    const { error } = await supabase.from("distribution_sources").insert(rows);
    setBusy(false);
    if (error) return setErr("Rattachement impossible : " + error.message);
    setPick(null);
    await load();
  }
  async function refill() {
    if (!distributionId || !window.confirm("Rattacher les collectes manquantes de la période ?\n\nLes collectes que tu avais retirées à la main seront de nouveau proposées.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("prefill_distribution_sources", { p_distribution: distributionId, p_force: true });
    setBusy(false);
    if (error) return setErr("Rattachement impossible : " + error.message);
    if (!data) setErr("Aucune collecte supplémentaire à rattacher sur la période.");
    await load();
  }
  async function saveNote(cat: string, text: string) {
    if (!distributionId) return;
    const t = text.trim();
    if ((notes[cat] ?? "") === t) return;
    const { error } = t
      ? await supabase.from("distribution_gap_notes").upsert({ distribution_id: distributionId, category: cat, comment: t, updated_at: new Date().toISOString() }, { onConflict: "distribution_id,category" })
      : await supabase.from("distribution_gap_notes").delete().eq("distribution_id", distributionId).eq("category", cat);
    if (error) return setErr("Commentaire non enregistré : " + error.message);
    setNotes((p) => {
      const n = { ...p };
      if (t) n[cat] = t;
      else delete n[cat];
      return n;
    });
  }

  if (!canRead) return <>{distribue}</>;

  const kpi = (label: string, value: string, sub?: string, accent?: string) => (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={accent ? { borderTop: `4px solid ${accent}` } : undefined}>
      <span className="block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{label}</span>
      <span className="font-display text-[26px] leading-tight font-black text-[var(--navy)] tabular-nums">{value}</span>
      {sub && <span className="block text-[11.5px] text-[var(--slate)]">{sub}</span>}
    </div>
  );
  const taux = totalCollected > 0 ? Math.round((totalDistributed / totalCollected) * 100) : null;
  const tabBtn = (k: typeof tab, label: string) => (
    <button key={k} type="button" onClick={() => openTab(k)} className={`rounded-[40px] px-5 py-2 text-[13px] font-bold ${tab === k ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)] hover:text-[var(--navy)]"}`}>{label}</button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpi("Distribué", fmtKg(totalDistributed), `${lines.length} ligne${lines.length > 1 ? "s" : ""} de produits`, "#2a78d6")}
        {kpi("Collecté", loaded ? fmtKg(totalCollected) : "…", loaded ? `${nLots} lot${nLots > 1 ? "s" : ""} · ${nDonors} donateur${nDonors > 1 ? "s" : ""}` : undefined, "#eb6834")}
        {kpi("Taux distribué", taux === null ? "—" : `${taux} %`, taux === null ? "aucune collecte rattachée" : "distribué ÷ collecté", "var(--turquoise)")}
        {kpi("Écart à justifier", loaded ? fmtKg(toJustify) : "…", toJustify > 0 ? "catégories hors « OK » sans commentaire" : "rien à justifier", toJustify > 0 ? "var(--warn)" : "var(--good)")}
      </div>

      <div className="inline-flex self-start rounded-[40px] bg-[var(--track)] p-[3px]">
        {tabBtn("distribue", "Distribué")}
        {tabBtn("collecte", "Collecté")}
        {tabBtn("comparatif", "Comparatif")}
      </div>

      {err && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr(null)}>×</button>
        </div>
      )}

      {tab === "distribue" && distribue}

      {tab === "collecte" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid #eb6834" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--navy)]">Collecté pour cette distribution</h3>
              <p className="text-[11.5px] text-[var(--slate)]">Collectes de l&apos;antenne depuis la distribution précédente jusqu&apos;à ce jour, rattachées automatiquement.{!canEdit && " Lecture seule."}</p>
            </div>
            {canEdit && distributionId && (
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={refill} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--navy)] hover:border-[#eb6834]">Rattacher les manquantes</button>
                <button type="button" disabled={busy} onClick={openPicker} className="rounded-[40px] bg-[#eb6834] px-3.5 py-2 text-[12.5px] font-semibold text-white">+ Choisir une collecte</button>
              </div>
            )}
          </div>
          {!distributionId ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Enregistrement de la distribution…</p>
          ) : !loaded ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Chargement…</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="bg-[var(--input-bg)] text-[11px] tracking-[0.03em] text-[var(--slate)] uppercase">
                    {["Catégorie", "Produit", "Provenance (donateur)", "Date de collecte", "Type", "Quantité (kg)", ""].map((h) => <th key={h} className="px-3 py-2 font-bold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {flat.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--slate)]">Aucune collecte rattachée. {date > new Date().toISOString().slice(0, 10) ? "Le rattachement se fait à partir du jour de la distribution." : canEdit ? "Utilise « Rattacher les manquantes » ou « Choisir une collecte »." : ""}</td></tr>
                  )}
                  {flat.map((f) => (
                    <tr key={f.key} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-semibold text-[var(--navy)]">{f.cat}</td>
                      <td className="px-3 py-2 text-[var(--navy)]">{f.product}</td>
                      <td className="px-3 py-2 text-[var(--navy)]">{f.donor}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-[var(--slate)]">{fmtD(f.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className="rounded-[40px] px-2 py-0.5 text-[10.5px] font-bold" style={f.type === "pro" ? { background: "rgba(42,120,214,.14)", color: "#2a78d6" } : { background: "var(--good-bg)", color: "var(--good)" }}>{f.type === "pro" ? "Pro (> 25 kg)" : "Bénévole (≤ 25 kg)"}</span></td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-[var(--navy)]">{r1(f.kg).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-2 text-right">{canEdit && <button type="button" onClick={() => removeSource(f.srcId)} title="Retirer cette collecte" className="h-7 w-7 rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}</td>
                    </tr>
                  ))}
                </tbody>
                {flat.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--input-bg)] font-bold text-[var(--navy)]"><td className="px-3 py-2" colSpan={5}>Total collecté · {nLots} lot{nLots > 1 ? "s" : ""}, {nDonors} donateur{nDonors > 1 ? "s" : ""}</td><td className="px-3 py-2 text-right tabular-nums">{r1(totalCollected).toLocaleString("fr-FR")}</td><td /></tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {pick && (
            <div className="mt-3 rounded-xl border-[1.5px] border-[#eb6834] bg-[var(--card)] p-3">
              <p className="mb-2 text-[13px] font-semibold text-[var(--navy)]">Collectes réalisées autour de cette date et pas encore rattachées</p>
              {pick.cands.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucune collecte disponible sur cette période.</p>}
              <div className="max-h-[260px] overflow-y-auto">
                {pick.cands.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-3 border-b border-[var(--border)] px-1 py-2 text-[12.5px] last:border-b-0">
                    <input type="checkbox" className="accent-[#eb6834]" checked={pick.sel.has(c.key)} onChange={(e) => setPick((p) => { if (!p) return p; const s = new Set(p.sel); if (e.target.checked) s.add(c.key); else s.delete(c.key); return { ...p, sel: s }; })} />
                    <span className="w-14 flex-none text-[var(--slate)]">{fmtD(c.date)}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-[var(--navy)]">{c.donor}</span>
                    <span className="flex-none tabular-nums text-[var(--navy)]">{r1(c.kg).toLocaleString("fr-FR")} kg</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setPick(null)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-1.5 text-[12.5px] font-semibold text-[var(--navy)]">Fermer</button>
                <button type="button" disabled={busy || pick.sel.size === 0} onClick={attachSelected} className="rounded-[40px] bg-[#eb6834] px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">Rattacher ({pick.sel.size})</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "comparatif" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid var(--turquoise)" }}>
          <h3 className="text-[15px] font-semibold text-[var(--navy)]">Comparatif par catégorie</h3>
          <p className="mb-3 text-[11.5px] text-[var(--slate)]">Écart = collecté − distribué. Statut selon l&apos;écart en % du collecté : OK sous 5 %, À vérifier jusqu&apos;à 20 %, Alerte au-delà.{!canEdit && " Lecture seule."}</p>
          {!distributionId || !loaded ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Chargement…</p>
          ) : cats.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Rien à comparer pour l&apos;instant : ni collecte rattachée, ni produit distribué.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="bg-[var(--input-bg)] text-[11px] tracking-[0.03em] text-[var(--slate)] uppercase">
                    {["Catégorie", "Collecté (kg)", "Distribué (kg)", "Écart (kg)", "Taux distribué", "Statut", "Commentaire"].map((h) => <th key={h} className="px-3 py-2 font-bold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => {
                    const col = collectedBy[c] ?? 0;
                    const dis = distributedBy[c] ?? 0;
                    const st = gapStatus(col, dis);
                    const ui = STATUS_UI[st.label];
                    return (
                      <tr key={c} className="border-t border-[var(--border)] align-top">
                        <td className="px-3 py-2 font-semibold text-[var(--navy)]">{c}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--navy)]">{r1(col).toLocaleString("fr-FR")}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--navy)]">{r1(dis).toLocaleString("fr-FR")}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-[var(--navy)]">{r1(col - dis).toLocaleString("fr-FR")}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--navy)]">{col > 0 ? `${Math.round((dis / col) * 100)} %` : "—"}</td>
                        <td className="px-3 py-2"><span className="rounded-[40px] px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap" style={{ background: ui.bg, color: ui.fg }}>{st.label}</span></td>
                        <td className="min-w-[220px] px-3 py-2">
                          {canEdit ? (
                            <input defaultValue={notes[c] ?? ""} key={c + (notes[c] ?? "")} onBlur={(e) => void saveNote(c, e.target.value)} placeholder={st.label === "OK" ? "" : "Ex : 15 kg de pâtes remis en stock"} className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-[12.5px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]" />
                          ) : (
                            <span className="text-[var(--navy)]">{notes[c] || <span className="text-[var(--muted)]">—</span>}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--input-bg)] font-bold text-[var(--navy)]">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r1(totalCollected).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r1(totalDistributed).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r1(totalCollected - totalDistributed).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{taux === null ? "—" : `${taux} %`}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
