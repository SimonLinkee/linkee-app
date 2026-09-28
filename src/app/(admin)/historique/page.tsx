"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Audit = {
  id: number;
  at: string;
  actor_email: string | null;
  table_name: string;
  row_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};
type BackupFile = { name: string; size: number | null; created_at: string | null; url: string | null };

const TABLE_LABELS: Record<string, string> = {
  partners: "Partenaire", beneficiaries: "Bénéficiaire", collectes: "Arrêt de tournée", collecte_items: "Poids saisi", stock_items: "Produit en stock",
  stock_movements: "Mouvement de stock", vehicles: "Véhicule", profiles: "Compte", exceptional_requests: "Demande partenaire",
  checklist_templates: "Checklist (modèle)", checklist_overrides: "Checklist (jour)", documents: "Document", partner_users: "Accès partenaire", cities: "Ville",
};
const ACTION: Record<Audit["action"], { label: string; cls: string }> = {
  INSERT: { label: "Ajout", cls: "bg-[var(--good-bg)] text-[var(--good)]" },
  UPDATE: { label: "Modification", cls: "bg-[var(--warn-bg)] text-[var(--warn)]" },
  DELETE: { label: "Suppression", cls: "bg-[var(--critical-bg)] text-[var(--critical)]" },
};
const NOISE = new Set(["updated_at", "created_at"]);

const short = (v: unknown) => {
  const s = v === null || v === undefined ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 70 ? s.slice(0, 68) + "…" : s;
};

function subject(a: Audit) {
  const r = (a.new_row ?? a.old_row ?? {}) as Record<string, unknown>;
  return (r.name ?? r.label ?? r.email ?? r.full_name ?? r.destination ?? r.day ?? r.scheduled_date ?? a.row_id ?? "") as string;
}

function changes(a: Audit): string[] {
  if (a.action !== "UPDATE" || !a.old_row || !a.new_row) return [];
  const out: string[] = [];
  for (const k of Object.keys(a.new_row)) {
    if (NOISE.has(k)) continue;
    const o = a.old_row[k];
    const n = a.new_row[k];
    if (JSON.stringify(o) === JSON.stringify(n)) continue;
    if (k === "fiche" && o && n && typeof o === "object" && typeof n === "object") {
      const sub = Object.keys({ ...(o as object), ...(n as object) }).filter((s) => JSON.stringify((o as Record<string, unknown>)[s]) !== JSON.stringify((n as Record<string, unknown>)[s]));
      out.push(`fiche : ${sub.join(", ")}`);
    } else out.push(`${k} : ${short(o)} → ${short(n)}`);
  }
  return out;
}

export default function HistoriquePage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<"modifs" | "sauvegardes">("modifs");
  const [rows, setRows] = useState<Audit[]>([]);
  const [tableFilter, setTableFilter] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const PAGE = 50;

  async function loadRows(reset: boolean) {
    setLoading(true);
    let q = supabase.from("audit_log").select("id,at,actor_email,table_name,row_id,action,old_row,new_row").order("at", { ascending: false });
    if (tableFilter) q = q.eq("table_name", tableFilter);
    const from = reset ? 0 : rows.length;
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) setMsg("Chargement impossible : " + error.message + " (la migration 008 est-elle passée ?)");
    const list = (data ?? []) as unknown as Audit[];
    setRows(reset ? list : [...rows, ...list]);
    setHasMore(list.length === PAGE);
    setLoading(false);
  }
  useEffect(() => {
    loadRows(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableFilter]);

  async function loadFiles() {
    const res = await fetch("/api/admin/backup");
    const json = await res.json();
    if (!res.ok) return setMsg(json.error ?? "Erreur");
    setFiles(json.files);
  }
  useEffect(() => {
    if (tab === "sauvegardes") loadFiles();
  }, [tab]);

  async function backupNow() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/backup", { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(json.error ?? "Sauvegarde impossible");
    setMsg(`Sauvegarde créée : ${json.name}`);
    loadFiles();
  }

  const fmtSize = (b: number | null) => (b == null ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`);

  return (
    <div className="max-w-[980px]">
      <h1 className="font-display text-[32px] leading-none font-black">Historique &amp; sauvegardes</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">Qui a modifié quoi et quand, et copies de sécurité de toute la base. Réservé à l&apos;admin principal.</p>

      <div className="mb-4 flex w-fit rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px] shadow-[var(--shadow)]">
        {(
          [
            ["modifs", "Modifications"],
            ["sauvegardes", "Sauvegardes"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-[40px] px-[18px] py-2 font-display text-[13.5px] font-bold ${tab === k ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
            {l}
          </button>
        ))}
      </div>

      {msg && <div className="mb-4 rounded-xl bg-[var(--input-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--navy)]">{msg}</div>}

      {tab === "modifs" && (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12.5px] font-semibold text-[var(--navy)]">
              <option value="">Tout</option>
              {Object.entries(TABLE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-[var(--slate)]">{rows.length} entrée(s) affichée(s)</span>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
            {rows.length === 0 && !loading && <p className="p-5 text-[13px] text-[var(--slate)]">Aucune modification enregistrée pour l&apos;instant.</p>}
            {rows.map((a) => {
              const diffs = changes(a);
              const expanded = open.has(a.id);
              return (
                <div key={a.id} className="border-b border-[var(--border)] px-4 py-3 last:border-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-[40px] px-2 py-[3px] text-[10px] font-bold uppercase ${ACTION[a.action].cls}`}>{ACTION[a.action].label}</span>
                    <span className="text-[13px] font-bold text-[var(--navy)]">{TABLE_LABELS[a.table_name] ?? a.table_name}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--slate)]">{subject(a)}</span>
                    <span className="text-[11.5px] text-[var(--muted)]">
                      {new Date(a.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {a.actor_email ?? "système"}
                    </span>
                  </div>
                  {diffs.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-5 text-[11.5px] text-[var(--slate)]">
                      {diffs.slice(0, expanded ? 50 : 4).map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} className="mt-1 text-[11px] font-bold text-[var(--turquoise)]">
                    {expanded ? "Masquer le détail" : "Voir le détail"}
                  </button>
                  {expanded && <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-[var(--input-bg)] p-2.5 text-[10.5px] leading-[1.4] text-[var(--slate)]">{JSON.stringify({ avant: a.old_row, apres: a.new_row }, null, 2)}</pre>}
                </div>
              );
            })}
            {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
          </div>
          {hasMore && !loading && (
            <button type="button" onClick={() => loadRows(false)} className="mt-3 rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 font-display text-[13px] font-bold text-[var(--slate)]">
              Charger plus
            </button>
          )}
        </div>
      )}

      {tab === "sauvegardes" && (
        <div>
          <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
            <h3 className="mb-1 font-display text-base font-extrabold">Copie de sécurité de la base</h3>
            <p className="mb-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">
              Une sauvegarde complète est faite automatiquement chaque nuit vers 3 h et conservée 30 jours. Elle contient tous les partenaires, bénéficiaires, tournées, poids, stock, flotte et comptes. Les <strong>fichiers</strong> (photos, logos, documents) restent dans leur espace de stockage
              et ne sont pas dans ce fichier.
            </p>
            <button type="button" disabled={busy} onClick={backupNow} className="rounded-[40px] bg-[var(--navy-deep)] px-[18px] py-2.5 font-display text-[13.5px] font-bold text-[var(--panel-fg)] disabled:opacity-60">
              {busy ? "Sauvegarde en cours…" : "Sauvegarder maintenant"}
            </button>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
            {files.length === 0 && <p className="p-5 text-[13px] text-[var(--slate)]">Aucune sauvegarde pour l&apos;instant.</p>}
            {files.map((f) => (
              <div key={f.name} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-none">
                <span className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[var(--navy)]">{f.name}</div>
                  <div className="text-[11.5px] text-[var(--slate)]">
                    {f.created_at ? new Date(f.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : ""} {fmtSize(f.size)}
                  </div>
                </span>
                {f.url && (
                  <a href={f.url} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-1.5 font-display text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                    Télécharger
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
