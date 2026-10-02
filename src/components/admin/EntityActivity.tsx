"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isCollectKind, isoOf } from "@/lib/stats";

type Item = { denree: string | null; kg: number | string | null };
type Row = { id: string; scheduled_date: string; scheduled_time: string | null; kind: string; status: string; motif: string | null; source: string | null; collecte_items: Item[] | null };

const SHOWN = 6;
const SHOWN_ALL = 60;
const day = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return { dow: d.toLocaleDateString("fr-FR", { weekday: "short" }), dom: d.getDate(), month: d.toLocaleDateString("fr-FR", { month: "short" }) };
};
const sum = (items: Item[] | null) => Math.round((items ?? []).reduce((s, i) => s + (Number(i.kg) || 0), 0) * 10) / 10;
const denrees = (items: Item[] | null) => Array.from(new Set((items ?? []).map((i) => i.denree).filter(Boolean))).join(", ");

function Line({ r, past, today }: { r: Row; past: boolean; today: string }) {
  const d = day(r.scheduled_date);
  let badge = "À venir";
  let bg = "var(--client-req-bg)";
  let fg = "var(--client-req)";
  let note = [r.scheduled_time ? r.scheduled_time.slice(0, 5) : "", denrees(r.collecte_items), r.source === "manual" ? "saisie manuelle" : ""].filter(Boolean).join(" · ") || "—";
  if (r.status === "en_attente") {
    badge = "Demande client";
  } else if (past) {
    if (r.status === "collecte") {
      badge = `${sum(r.collecte_items)} kg`;
      bg = "var(--good-bg)";
      fg = "var(--good)";
    } else if (r.status === "annule") {
      badge = "Annulée";
      bg = "var(--critical-bg)";
      fg = "var(--critical)";
      note = r.motif?.trim() ? `Motif : ${r.motif.trim()}` : note;
    } else {
      badge = "Non réalisée";
      bg = "var(--warn-bg)";
      fg = "var(--warn)";
    }
  } else if (r.scheduled_date === today) {
    badge = "Aujourd'hui";
  }
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] py-2.5 last:border-b-0">
      <span className="w-[52px] flex-none text-center">
        <span className="block text-[10px] font-bold text-[var(--slate)] uppercase">{d.dow}</span>
        <span className="block font-display text-[20px] leading-none font-black text-[var(--navy)]">{d.dom}</span>
        <span className="block text-[10px] text-[var(--slate)]">{d.month}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--slate)]" title={note}>{note}</span>
      <span className="flex-none rounded-[40px] px-2.5 py-[5px] text-[10px] font-bold whitespace-nowrap uppercase" style={{ background: bg, color: fg }}>{badge}</span>
    </div>
  );
}

/** Pilotage (Superadmin, Comptabilité) : quand le tableau de bord est isolé sur un partenaire ou un lieu de dépose,
 * ses prochaines collectes / livraisons et son historique passent en tête de page — on en a souvent besoin. Indépendant
 * de la période du tableau de bord : toujours les plus récentes. */
export default function EntityActivity({ kind, id }: { kind: "partner" | "beneficiary"; id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const today = isoOf(new Date());
  const isPartner = kind === "partner";

  useEffect(() => {
    supabase
      .from("collectes")
      .select("id,scheduled_date,scheduled_time,kind,status,motif,source,collecte_items!collecte_id(denree,kg)")
      .eq(isPartner ? "partner_id" : "beneficiary_id", id)
      .order("scheduled_date", { ascending: false })
      .limit(500)
      .then(({ data, error: err }) => {
        if (err) return setError(err.message);
        const list = (data ?? []) as unknown as Row[];
        setRows(list.filter((r) => (isPartner ? isCollectKind(r.kind) : r.kind === "dropoff")));
      });
  }, [supabase, id, isPartner]);

  const list = rows ?? [];
  const upcoming = list.filter((r) => (r.status === "todo" || r.status === "en_attente") && r.scheduled_date >= today).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
  const history = list.filter((r) => r.status === "collecte" || r.status === "annule" || (r.status === "todo" && r.scheduled_date < today)); // déjà triées du plus récent au plus ancien
  const cap = all ? SHOWN_ALL : SHOWN;
  const noun = isPartner ? "collectes" : "livraisons";

  const card = "rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]";
  return (
    <section className="mb-[22px] grid grid-cols-1 gap-4 lg:grid-cols-2">
      {error && <div className="rounded-xl bg-[var(--critical-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--critical)] lg:col-span-2">Chargement impossible : {error}</div>}
      <div className={card}>
        <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Prochaines {noun}</h3>
        <p className="mb-2 text-[11.5px] text-[var(--slate)]">Planifiées à partir d&apos;aujourd&apos;hui{upcoming.length ? ` · ${upcoming.length}` : ""}</p>
        {rows === null ? (
          <p className="text-[12px] text-[var(--slate)]">Chargement…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-[12px] text-[var(--slate)]">Aucune {isPartner ? "collecte planifiée" : "livraison planifiée"} pour l&apos;instant.</p>
        ) : (
          upcoming.slice(0, cap).map((r) => <Line key={r.id} r={r} past={false} today={today} />)
        )}
      </div>
      <div className={card}>
        <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Historique des {noun}</h3>
        <p className="mb-2 text-[11.5px] text-[var(--slate)]">Les plus récentes d&apos;abord{history.length ? ` · ${history.length}` : ""}</p>
        {rows === null ? (
          <p className="text-[12px] text-[var(--slate)]">Chargement…</p>
        ) : history.length === 0 ? (
          <p className="text-[12px] text-[var(--slate)]">Aucun historique pour l&apos;instant.</p>
        ) : (
          history.slice(0, cap).map((r) => <Line key={r.id} r={r} past today={today} />)
        )}
      </div>
      {(upcoming.length > SHOWN || history.length > SHOWN) && (
        <button type="button" onClick={() => setAll((v) => !v)} className="justify-self-start text-[12.5px] font-bold text-[var(--turquoise)] lg:col-span-2">
          {all ? "Réduire" : "Tout afficher"}
        </button>
      )}
    </section>
  );
}
