"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOC_ACCEPT, DOC_SELECT, fmtSize, openDocument, uploadDocument, type DocRow } from "@/lib/documents";
import type { CerfaStatus } from "@/lib/cerfa";
import { signedUrls } from "@/lib/photos";

type CollecteLite = { id: string; scheduled_date: string; source: string; status: string };
type Owner = { partnerId: string; beneficiaryId?: undefined } | { partnerId?: undefined; beneficiaryId: string };
/** Sélection de documents pour une demande de Cerfa (espace partenaire) : un document déjà pris dans une demande
 * active est grisé ("En demande" / "Cerfa émis") et ne peut ni être re-sélectionné ni supprimé. */
export type CerfaSelection = { selected: string[]; locked: Record<string, CerfaStatus>; onToggle: (docId: string) => void };

const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDayFull = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SOURCE_LABEL: Record<string, string> = { admin: "l'admin", partenaire: "le partenaire", beneficiaire: "l'association" };

/** "Mes documents" : dossier partagé entre Linkee et le partenaire OU le bénéficiaire (listing des produits,
 * conventions, attestations…). Un fichier déposé pour une structure n'est jamais visible d'une autre. */
export default function PartnerDocuments({ role, cerfa, readOnly = false, ...owner }: Owner & { role: "admin" | "partenaire" | "beneficiaire"; cerfa?: CerfaSelection; readOnly?: boolean }) {
  const ownerId = owner.partnerId ?? owner.beneficiaryId!;
  const ownerCol = owner.partnerId ? "partner_id" : "beneficiary_id";
  const supabase = useMemo(() => createClient(), []);
  const input = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [collectes, setCollectes] = useState<CollecteLite[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [collecteId, setCollecteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    setUserId(auth.user?.id ?? null);
    const [d, c] = await Promise.all([
      supabase.from("documents").select(DOC_SELECT).eq(ownerCol, ownerId).order("created_at", { ascending: false }),
      owner.partnerId
        ? supabase.from("collectes").select("id,scheduled_date,source,status").eq("partner_id", owner.partnerId).in("status", ["collecte", "todo"]).order("scheduled_date", { ascending: false }).limit(80)
        : Promise.resolve({ data: [] as CollecteLite[], error: null }),
    ]);
    if (d.error) setMsg("Chargement impossible : " + d.error.message + " (la migration 030 est-elle passée ?)");
    const rows = (d.data ?? []) as unknown as DocRow[];
    setDocs(rows);
    setCollectes((c.data ?? []) as CollecteLite[]);
    setLoading(false);
    // vignettes des photos de collecte (réservées à l'équipe, coffre privé)
    const photos = rows.filter((x) => x.category === "photo_collecte" && x.bucket === "collecte-photos");
    if (photos.length) {
      const urls = await signedUrls(supabase, photos.map((x) => x.storage_path));
      setThumbs(Object.fromEntries(photos.map((x, i) => [x.id, urls[i]]).filter((e) => e[1])));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function onFiles(files: File[]) {
    setBusy(true);
    setMsg(null);
    const added: DocRow[] = [];
    for (const file of files) {
      try {
        added.push(await uploadDocument(supabase, { partnerId: owner.partnerId, beneficiaryId: owner.beneficiaryId, file, source: role, userId, collecteId: collecteId || null }));
      } catch (e) {
        setMsg((e as Error).message);
      }
    }
    if (added.length) setDocs((prev) => [...added, ...prev]);
    setBusy(false);
  }

  async function remove(d: DocRow) {
    if (d.category === "fichier_arret") {
      // fichier joint à un arrêt du Planning : on le retire de l'arrêt, la base le retire alors des documents (pas de doublon)
      if (!window.confirm(`Retirer « ${d.name} » ? Il sera aussi retiré de l'arrêt du Planning (le logisticien ne le verra plus).`)) return;
      if (d.collecte_id) {
        const { data: c, error: e1 } = await supabase.from("collectes").select("team_files").eq("id", d.collecte_id).single();
        if (e1) return setMsg("Suppression impossible : " + e1.message);
        const kept = ((c?.team_files ?? []) as { path: string }[]).filter((f) => f.path !== d.storage_path);
        const { error: e2 } = await supabase.from("collectes").update({ team_files: kept }).eq("id", d.collecte_id);
        if (e2) return setMsg("Suppression impossible : " + e2.message);
        await supabase.storage.from("collecte-photos").remove([d.storage_path]);
      }
      const { error } = await supabase.from("documents").delete().eq("id", d.id);
      if (error && d.collecte_id === null) return setMsg("Suppression impossible : " + error.message);
      setDocs((prev) => prev.filter((x) => x.id !== d.id));
      return;
    }
    if (!window.confirm(`Supprimer « ${d.name} » ?`)) return;
    await supabase.storage.from("documents").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) return setMsg("Suppression impossible : " + error.message);
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
  }

  const collecteLabel = (id: string | null) => {
    if (!id) return null;
    const c = collectes.find((x) => x.id === id);
    return c ? `Collecte du ${fmtDay(c.scheduled_date)}${c.source === "manual" ? " (saisie manuelle)" : ""}` : "Collecte associée";
  };

  const regular = docs.filter((d) => !d.category);
  const files = docs.filter((d) => d.category === "fichier_arret");
  const photoGroups = useMemo(() => {
    const m = new Map<string, DocRow[]>();
    for (const d of docs.filter((x) => x.category === "photo_collecte")) {
      const k = d.doc_date ?? "?";
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [docs]);

  const renderDoc = (d: DocRow) => {
          const lockedStatus = cerfa?.locked[d.id];
          const canDelete = (role === "admin" || d.source === role) && !lockedStatus && !readOnly && d.category !== "photo_collecte";
          const col = collecteLabel(d.collecte_id);
          return (
            <div key={d.id} className={`flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 ${lockedStatus ? "opacity-60" : ""}`}>
              {cerfa && (
                <input
                  type="checkbox"
                  aria-label={`Sélectionner ${d.name} pour un Cerfa`}
                  disabled={!!lockedStatus}
                  checked={!lockedStatus && cerfa.selected.includes(d.id)}
                  onChange={() => cerfa.onToggle(d.id)}
                  className="h-[17px] w-[17px] flex-none accent-[var(--navy-deep)] disabled:cursor-not-allowed"
                />
              )}
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[var(--track)] text-[var(--slate)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                  <path d="M7 3 H14 L19 8 V21 H7 Z" />
                  <path d="M14 3 V8 H19" />
                </svg>
              </span>
              <button type="button" onClick={() => openDocument(supabase, d.storage_path, d.bucket).catch((e) => setMsg((e as Error).message))} className="min-w-0 flex-1 text-left" title="Ouvrir / télécharger">
                <div className="truncate text-[13.5px] font-bold text-[var(--navy)]">{d.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-[var(--slate)]">
                  <span>{fmtDay(d.created_at.slice(0, 10))}</span>
                  {d.size_bytes != null && <span>{fmtSize(d.size_bytes)}</span>}
                  <span className="rounded-[40px] px-2 py-px text-[10.5px] font-bold" style={d.source !== "admin" ? { background: "var(--client-req-bg)", color: "var(--client-req)" } : { background: "var(--navy-deep)", color: "var(--panel-fg)" }}>
                    Déposé par {SOURCE_LABEL[d.source] ?? d.source}
                  </span>
                  {d.team_only && <span className="rounded-[40px] bg-[var(--track)] px-2 py-px text-[10.5px] font-bold text-[var(--slate)]">🔒 Équipe uniquement</span>}
                  {d.category === "fichier_arret" && d.doc_date && <span className="rounded-[40px] bg-[var(--good-bg)] px-2 py-px text-[10.5px] font-bold text-[var(--good)]">Arrêt du {fmtDay(d.doc_date)}</span>}
                  {col && <span className="rounded-[40px] bg-[var(--good-bg)] px-2 py-px text-[10.5px] font-bold text-[var(--good)]">{col}</span>}
                  {lockedStatus && (
                    <span className="rounded-[40px] px-2 py-px text-[10.5px] font-bold" style={lockedStatus === "emise" ? { background: "var(--good-bg)", color: "var(--good)" } : { background: "rgba(42,120,214,.16)", color: "#2a78d6" }}>
                      {lockedStatus === "emise" ? "Cerfa émis" : "En demande"}
                    </span>
                  )}
                </div>
              </button>
              <button type="button" onClick={() => openDocument(supabase, d.storage_path, d.bucket).catch((e) => setMsg((e as Error).message))} className="flex-none rounded-[40px] border-[1.5px] border-[var(--border)] px-3 py-1.5 text-[12px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                Télécharger
              </button>
              {canDelete && (
                <button type="button" title="Supprimer" onClick={() => remove(d)} className="flex h-8 w-8 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                  ×
                </button>
              )}
            </div>
          );
  };

  return (
    <div>
      <p className="mb-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">
        Dossier partagé entre Linkee et {owner.partnerId ? "le partenaire" : "l'association"}
        {owner.partnerId ? (
          <>
            {" "}: les partenaires y déposent notamment le <strong className="text-[var(--navy)]">listing détaillé des produits donnés</strong> — c&apos;est la référence pour retrouver le détail des dons et leur valeur.
          </>
        ) : (
          <> : convention, attestations, justificatifs…</>
        )}{" "}
        Formats acceptés : PDF, Excel, CSV et images.
      </p>

      {!readOnly && (
      <div className="mb-4 rounded-2xl border border-dashed border-[var(--turquoise)] bg-[var(--input-bg)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex items-center gap-2 rounded-[40px] bg-[var(--navy-deep)] px-4 py-2.5 font-display text-[13.5px] font-bold text-[var(--panel-fg)] disabled:opacity-60">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 4 V15 M7 9 L12 4 L17 9" />
              <path d="M4 19 H20" />
            </svg>
            {busy ? "Envoi en cours…" : "Déposer des documents"}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept={DOC_ACCEPT}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) onFiles(files);
            }}
          />
          {owner.partnerId && (
            <label className="flex min-w-[200px] flex-1 items-center gap-2 text-[12px] font-semibold text-[var(--slate)]">
              Collecte associée (facultatif)
              <select value={collecteId} onChange={(e) => setCollecteId(e.target.value)} className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[12.5px] text-[var(--navy)]">
                <option value="">Aucune</option>
                {collectes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fmtDay(c.scheduled_date)}
                    {c.status === "todo" ? " · à venir" : ""}
                    {c.source === "manual" ? " · saisie manuelle" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      )}

      {msg && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{msg}</div>}
      {loading && <p className="text-[13px] text-[var(--slate)]">Chargement…</p>}
      {!loading && docs.length === 0 && <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-[var(--slate)]">Aucun document pour l&apos;instant.</p>}

      <div className="flex flex-col gap-2">{regular.map(renderDoc)}</div>

      {files.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 font-display text-[14px] font-extrabold text-[var(--navy)]">Fichiers joints aux arrêts</h3>
          <p className="mb-2.5 text-[11.5px] text-[var(--slate)]">🔒 Visible par l&apos;équipe Linkee uniquement — ajoutés depuis le Planning, un fichier retiré de l&apos;arrêt disparaît d&apos;ici.</p>
          <div className="flex flex-col gap-2">{files.map(renderDoc)}</div>
        </div>
      )}

      {photoGroups.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 font-display text-[14px] font-extrabold text-[var(--navy)]">Mes photos de collecte</h3>
          <p className="mb-2.5 text-[11.5px] text-[var(--slate)]">🔒 Visible par l&apos;équipe Linkee uniquement — photos prises par le logisticien à chaque collecte, rangées par date.</p>
          <div className="flex flex-col gap-3">
            {photoGroups.map(([day, list]) => (
              <div key={day} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="mb-2 text-[12.5px] font-bold capitalize text-[var(--navy)]">
                  {day === "?" ? "Date inconnue" : `Collecte du ${fmtDayFull(day)}`} <span className="font-semibold normal-case text-[var(--slate)]">· {list.length} photo{list.length > 1 ? "s" : ""}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((d) => (
                    <button key={d.id} type="button" title={d.name} onClick={() => openDocument(supabase, d.storage_path, d.bucket).catch((e) => setMsg((e as Error).message))} className="h-[84px] w-[84px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--track)]">
                      {thumbs[d.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbs[d.id]} alt={d.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-[var(--slate)]">Photo</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
