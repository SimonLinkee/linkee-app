"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { canAdminCity, isSuper } from "@/lib/roles";

// Comparatif « Collecté vs Distribué » d'une distribution : onglets Distribué (tableau existant, inchangé), Collecté et Comparatif,
// plus 4 chiffres clés en haut.
// « Collecté » = les collectes DU JOUR de la distribution (Planning). Ce sont les vraies lignes (collecte_items) que le logisticien
// remplit : les modifier ici les modifie aussi dans le Planning, le tableau de bord et l'appli du logisticien.
// Lecture : Superadmin, Comptabilité, Responsable d'antenne, Responsable distribution. Modification : tous sauf le Responsable
// distribution. Les règles sont appliquées par la base (RLS) ; ici on adapte seulement l'affichage.

const CATS = ["F&L", "Boulang", "Sec", "Frais", "Plats préparés", "Hygiène", "Autre"]; // mêmes catégories que la saisie de distribution
const DENREE_TO_CAT: Record<string, string> = { "Fruits et légumes": "F&L", Boulangerie: "Boulang", Secs: "Sec", "Produits frais": "Frais", "Plats préparés": "Plats préparés" };
const DENREES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const COLLECT_KINDS = ["partner", "exceptionnel", "demande_client"];

type Rel<T> = T | T[] | null;
const first = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
type Item = { id: string; denree: string | null; name: string | null; kg: number | string | null; quantity: number | string | null; unit: string | null };
type Col = { id: string; status: string; kind: string; label: string | null; partner_id: string | null; partners: Rel<{ name: string }>; collecte_items: Item[] | null };
type LinkRow = { id: string; weight_actual: number | string | null; kg_estime: number | string | null; denree: string | null; partner_id: string | null; partners: Rel<{ name: string }> };
type Flat = { key: string; lot: string; donorId: string; cat: string; kg: number };

const kgNum = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtKg = (n: number) => `${r1(n).toLocaleString("fr-FR")} kg`;
const fmtLong = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

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

const COL_SELECT = "id,status,kind,label,partner_id,partners(name),collecte_items!collecte_id(id,denree,name,kg,quantity,unit)";
const inputCls = "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[12.5px] text-[var(--navy)] hover:border-[var(--border)] focus:border-[var(--turquoise)] focus:bg-[var(--input-bg)] focus:outline-none";

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
  const [cols, setCols] = useState<Col[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!cityId) return;
    const [c, l, n] = await Promise.all([
      supabase.from("collectes").select(COL_SELECT).eq("city_id", cityId).eq("source", "planning").eq("scheduled_date", date).in("kind", COLLECT_KINDS).neq("status", "annule").order("sort_order"),
      supabase.from("links").select("id,weight_actual,kg_estime,denree,partner_id,partners(name)").eq("city_id", cityId).eq("status", "livree").eq("window_date", date),
      distributionId ? supabase.from("distribution_gap_notes").select("category,comment").eq("distribution_id", distributionId) : Promise.resolve({ data: [] as { category: string; comment: string }[], error: null }),
    ]);
    if (c.error) setErr("Chargement impossible : " + c.error.message);
    setCols((c.data ?? []) as unknown as Col[]);
    setLinks((l.data ?? []) as unknown as LinkRow[]);
    setNotes(Object.fromEntries(((n.data ?? []) as { category: string; comment: string }[]).map((x) => [x.category, x.comment])));
    setLoaded(true);
  }, [supabase, cityId, date, distributionId]);

  useEffect(() => {
    if (!canRead) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [canRead, load]);

  // le commentaire d'écart a besoin d'une distribution enregistrée : on la crée si besoin
  function openTab(t: "distribue" | "collecte" | "comparatif") {
    setTab(t);
    if (t === "comparatif" && !distributionId) ensureSaved();
  }

  /* ---------- données à plat (seules les collectes réalisées comptent) ---------- */
  const done = useMemo(() => cols.filter((c) => c.status === "collecte"), [cols]);
  const flat: Flat[] = useMemo(() => {
    const out: Flat[] = [];
    for (const c of done) {
      for (const it of c.collecte_items ?? []) {
        if (kgNum(it.kg) > 0) out.push({ key: it.id, lot: c.id, donorId: c.partner_id ?? c.id, cat: (it.denree && DENREE_TO_CAT[it.denree]) || "Autre", kg: kgNum(it.kg) });
      }
    }
    for (const l of links) out.push({ key: l.id, lot: l.id, donorId: l.partner_id ?? l.id, cat: (l.denree && DENREE_TO_CAT[l.denree]) || "Autre", kg: kgNum(l.weight_actual ?? l.kg_estime) });
    return out;
  }, [done, links]);

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

  /* ---------- modification des lignes de collecte (Superadmin, Comptabilité, Responsable d'antenne) ---------- */
  async function saveItem(it: Item, patch: { denree?: string; name?: string | null; kg?: number }) {
    const upd: Record<string, unknown> = { ...patch };
    // une quantité saisie en kg suit le poids ; pour une autre unité (pièces, litres…) la quantité reste telle quelle
    if (patch.kg !== undefined && (it.unit === "kg" || it.unit == null)) upd.quantity = patch.kg;
    setBusy(true);
    const { data, error } = await supabase.from("collecte_items").update(upd).eq("id", it.id).select("id");
    setBusy(false);
    if (error || !data?.length) return setErr("Modification impossible : " + (error?.message ?? "refusée par la base (droits insuffisants ?)"));
    await load();
  }
  async function addItem(colId: string) {
    setBusy(true);
    const { error } = await supabase.from("collecte_items").insert({ collecte_id: colId, denree: "Secs", kg: 0, quantity: 0, unit: "kg" });
    setBusy(false);
    if (error) return setErr("Ajout impossible : " + error.message);
    await load();
  }
  async function delItem(it: Item) {
    if (!window.confirm("Supprimer cette ligne ? Elle disparaît aussi du Planning et de la saisie du logisticien.")) return;
    const { data, error } = await supabase.from("collecte_items").delete().eq("id", it.id).select("id");
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "refusée par la base"));
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
        {kpi("Taux distribué", taux === null ? "—" : `${taux} %`, taux === null ? "aucune collecte ce jour-là" : "distribué ÷ collecté", "var(--turquoise)")}
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
          <div className="mb-3">
            <h3 className="text-[15px] font-semibold text-[var(--navy)]">Collecté le {fmtLong(date)}</h3>
            <p className="text-[11.5px] text-[var(--slate)]">
              Les collectes du jour au Planning, avec ce que le logisticien a saisi.{" "}
              {canEdit ? "Tu peux corriger les lignes : le changement se répercute dans le Planning, le tableau de bord et l'appli du logisticien." : "Lecture seule."}
            </p>
          </div>
          {!loaded ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Chargement…</p>
          ) : cols.length === 0 && links.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Aucune collecte au Planning ce jour-là.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[720px] text-left text-[12.5px]">
                <thead>
                  <tr className="bg-[var(--input-bg)] text-[11px] tracking-[0.03em] text-[var(--slate)] uppercase">
                    {["Catégorie", "Produit", "Provenance (donateur)", "Type", "Quantité (kg)", ""].map((h) => <th key={h} className="px-3 py-2 font-bold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cols.map((c) => {
                    const donor = first(c.partners)?.name ?? c.label ?? "Partenaire";
                    const items = c.collecte_items ?? [];
                    const isDone = c.status === "collecte";
                    return [
                      <tr key={c.id} className="border-t border-[var(--border)] bg-[var(--track)]">
                        <td colSpan={4} className="px-3 py-1.5 font-semibold text-[var(--navy)]">
                          {donor}
                          <span className="ml-2 rounded-[40px] px-2 py-0.5 text-[10.5px] font-bold" style={isDone ? { background: "var(--good-bg)", color: "var(--good)" } : { background: "var(--warn-bg)", color: "var(--warn)" }}>{isDone ? "Collectée" : "À faire — pas encore saisie par le logisticien"}</span>
                        </td>
                        <td colSpan={2} className="px-3 py-1.5 text-right">
                          {isDone && canEdit && <button type="button" disabled={busy} onClick={() => addItem(c.id)} className="text-[12px] font-semibold text-[#eb6834]">+ Ajouter une ligne</button>}
                          {!isDone && <Link href="/planning" className="text-[12px] font-semibold text-[var(--slate)] underline">Voir au Planning</Link>}
                        </td>
                      </tr>,
                      ...(isDone && items.length === 0
                        ? [<tr key={c.id + "e"} className="border-t border-[var(--border)]"><td colSpan={6} className="px-3 py-2 text-[var(--slate)]">Aucune ligne saisie pour cette collecte.</td></tr>]
                        : []),
                      ...(isDone
                        ? items.map((it) => (
                            <tr key={it.id} className="border-t border-[var(--border)]">
                              <td className="px-3 py-1">
                                {canEdit ? (
                                  <select value={it.denree ?? ""} onChange={(e) => void saveItem(it, { denree: e.target.value })} className={inputCls}>
                                    {Array.from(new Set([...DENREES, it.denree ?? ""])).filter(Boolean).map((d) => <option key={d} value={d}>{DENREE_TO_CAT[d] ?? d}</option>)}
                                  </select>
                                ) : (
                                  <span className="px-2 font-semibold text-[var(--navy)]">{(it.denree && DENREE_TO_CAT[it.denree]) || "Autre"}</span>
                                )}
                              </td>
                              <td className="px-3 py-1">
                                {canEdit ? (
                                  <input defaultValue={it.name ?? ""} key={it.id + (it.name ?? "")} placeholder={it.denree ?? "Produit"} onBlur={(e) => e.target.value.trim() !== (it.name ?? "") && void saveItem(it, { name: e.target.value.trim() || null })} className={inputCls} />
                                ) : (
                                  <span className="px-2 text-[var(--navy)]">{it.name || it.denree || "—"}</span>
                                )}
                              </td>
                              <td className="px-3 py-1 text-[var(--navy)]">{donor}</td>
                              <td className="px-3 py-1 whitespace-nowrap"><span className="rounded-[40px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "rgba(42,120,214,.14)", color: "#2a78d6" }}>Pro (&gt; 25 kg)</span></td>
                              <td className="px-3 py-1 text-right">
                                {canEdit ? (
                                  <input type="number" min={0} step="0.1" defaultValue={kgNum(it.kg)} key={it.id + String(it.kg)} onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== kgNum(it.kg) && void saveItem(it, { kg: Math.max(0, Number(e.target.value)) })} className={inputCls + " w-24 text-right font-bold tabular-nums"} />
                                ) : (
                                  <span className="font-bold tabular-nums text-[var(--navy)]">{r1(kgNum(it.kg)).toLocaleString("fr-FR")}</span>
                                )}
                              </td>
                              <td className="px-3 py-1 text-right">{canEdit && <button type="button" onClick={() => delItem(it)} title="Supprimer cette ligne" className="h-7 w-7 rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}</td>
                            </tr>
                          ))
                        : []),
                    ];
                  })}
                  {links.length > 0 && (
                    <tr className="border-t border-[var(--border)] bg-[var(--track)]"><td colSpan={6} className="px-3 py-1.5 font-semibold text-[var(--navy)]">Links bénévoles livrés ce jour-là <span className="ml-2 text-[11px] font-normal text-[var(--slate)]">modifiables depuis la page Link citoyen</span></td></tr>
                  )}
                  {links.map((l) => (
                    <tr key={l.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-semibold text-[var(--navy)]">{(l.denree && DENREE_TO_CAT[l.denree]) || "Autre"}</td>
                      <td className="px-3 py-2 text-[var(--navy)]">{l.denree || "Link bénévole"}</td>
                      <td className="px-3 py-2 text-[var(--navy)]">{first(l.partners)?.name ?? "Partenaire"}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className="rounded-[40px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "var(--good-bg)", color: "var(--good)" }}>Bénévole (≤ 25 kg)</span></td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-[var(--navy)]">{r1(kgNum(l.weight_actual ?? l.kg_estime)).toLocaleString("fr-FR")}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
                {flat.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--input-bg)] font-bold text-[var(--navy)]"><td className="px-3 py-2" colSpan={4}>Total collecté · {nLots} lot{nLots > 1 ? "s" : ""}, {nDonors} donateur{nDonors > 1 ? "s" : ""}</td><td className="px-3 py-2 text-right tabular-nums">{r1(totalCollected).toLocaleString("fr-FR")}</td><td /></tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "comparatif" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid var(--turquoise)" }}>
          <h3 className="text-[15px] font-semibold text-[var(--navy)]">Comparatif par catégorie</h3>
          <p className="mb-3 text-[11.5px] text-[var(--slate)]">Collecté du jour (collectes réalisées) contre distribué. Écart = collecté − distribué. Statut selon l&apos;écart en % du collecté : OK sous 5 %, À vérifier jusqu&apos;à 20 %, Alerte au-delà.{!canEdit && " Lecture seule."}</p>
          {!loaded ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Chargement…</p>
          ) : cats.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Rien à comparer pour l&apos;instant : ni collecte réalisée ce jour-là, ni produit distribué.</p>
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
                            <input disabled={!distributionId} defaultValue={notes[c] ?? ""} key={c + (notes[c] ?? "")} onBlur={(e) => void saveNote(c, e.target.value)} placeholder={st.label === "OK" ? "" : "Ex : 15 kg de pâtes remis en stock"} className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-[12.5px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]" />
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
