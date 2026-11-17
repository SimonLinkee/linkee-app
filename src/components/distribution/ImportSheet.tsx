"use client";

import { useMemo, useRef, useState } from "react";
import type { ParsedLine, ParsedMeta, ParsedTab } from "@/lib/distribSheet";

// Importe les chiffres d'une distribution depuis le classeur « Schéma cible » (Google Sheet partagé par lien, ou fichier Excel) :
// l'onglet de la bonne date / du bon lieu est reconnu tout seul, un aperçu est montré, et rien n'est rempli avant confirmation.

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokens = (v: string) => new Set(norm(v).split(" ").filter((w) => w.length > 1));
const fmtDay = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "date inconnue");
const STORE_KEY = "linkee.distribSheetUrl";

export type ImportResult = { lines: ParsedLine[]; meta: ParsedMeta; mode: "replace" | "append"; withMeta: boolean };

export default function ImportSheet({
  placeName,
  date,
  hasLines,
  onClose,
  onApply,
}: {
  placeName: string;
  date: string;
  hasLines: boolean;
  onClose: () => void;
  onApply: (r: ImportResult) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(() => {
    try {
      return window.localStorage.getItem(STORE_KEY) ?? "";
    } catch {
      return ""; // stockage indisponible
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<ParsedTab[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [mode, setMode] = useState<"replace" | "append">(hasLines ? "append" : "replace");
  const [withMeta, setWithMeta] = useState(true);


  // onglets classés : même date d'abord, puis nom du lieu le plus proche
  const ranked = useMemo(() => {
    if (!tabs) return [];
    const want = tokens(placeName);
    return tabs
      .filter((t) => t.lines.length > 0)
      .map((t) => {
        const have = tokens(t.meta.distribution);
        let common = 0;
        want.forEach((w) => have.has(w) && common++);
        return { t, score: (t.meta.date === date ? 100 : 0) + common };
      })
      .sort((a, b) => b.score - a.score || (b.t.meta.date ?? "").localeCompare(a.t.meta.date ?? ""));
  }, [tabs, placeName, date]);
  const sameDate = ranked.filter((r) => r.t.meta.date === date);
  const current = tabs?.find((t) => t.name === picked) ?? null;

  async function read(form: FormData) {
    setBusy(true);
    setError(null);
    setTabs(null);
    try {
      const res = await fetch("/api/distributions/import", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { tabs?: ParsedTab[]; error?: string };
      if (!res.ok || !json.tabs) throw new Error(json.error ?? "Lecture impossible.");
      setTabs(json.tabs);
      const want = tokens(placeName);
      const best = json.tabs
        .filter((t) => t.lines.length > 0)
        .map((t) => {
          const have = tokens(t.meta.distribution);
          let common = 0;
          want.forEach((w) => have.has(w) && common++);
          return { t, score: (t.meta.date === date ? 100 : 0) + common };
        })
        .sort((a, b) => b.score - a.score)[0];
      setPicked(best && best.t.meta.date === date ? best.t.name : "");
      if (!best || best.t.meta.date !== date) setError(`Aucun onglet daté du ${fmtDay(date)} n'a été trouvé : choisis l'onglet à la main dans la liste.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function readUrl() {
    if (!url.trim()) return setError("Colle le lien du Google Sheet.");
    try {
      window.localStorage.setItem(STORE_KEY, url.trim());
    } catch {
      /* ignoré */
    }
    const f = new FormData();
    f.set("url", url.trim());
    void read(f);
  }
  function readFile(file: File) {
    const f = new FormData();
    f.set("file", file);
    void read(f);
  }

  const mismatch = current && current.meta.date && current.meta.date !== date;
  const totalKg = current ? Math.round(current.lines.reduce((s, l) => s + (parseFloat(l.weight_kg) || 0), 0) * 10) / 10 : 0;
  const inputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose} role="dialog" aria-label="Importer les produits distribués depuis le fichier">
      <div className="my-6 w-full max-w-[860px] rounded-[18px] bg-[var(--card)] p-5 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[18px] font-extrabold text-[var(--navy)]">Importer depuis le fichier</h3>
            <p className="text-[12px] text-[var(--slate)]">
              {placeName} · {fmtDay(date)} — l&apos;onglet de cette date est reconnu automatiquement, tu vérifies l&apos;aperçu avant de remplir.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--slate)]">
            Fermer
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3.5">
          <label className="mb-1 block text-[11.5px] font-semibold text-[var(--slate)]">Lien du Google Sheet (partagé « tous les utilisateurs disposant du lien »)</label>
          <div className="flex flex-wrap gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={`${inputCls} min-w-[240px] flex-1`} />
            <button type="button" disabled={busy} onClick={readUrl} className="rounded-[40px] bg-[#2a78d6] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-60">
              {busy ? "Lecture…" : "Lire le fichier"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--slate)]">
            <span>ou</span>
            <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] disabled:opacity-60">
              Envoyer un fichier Excel (.xlsx)
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) readFile(f);
              }}
            />
            <span>(le classeur complet : tous ses onglets sont lus)</span>
          </div>
        </div>

        {error && <div className="mt-3 rounded-xl bg-[var(--warn-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--warn)]">{error}</div>}

        {tabs && (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="text-[12px] font-semibold text-[var(--slate)]">Onglet</label>
              <select value={picked} onChange={(e) => setPicked(e.target.value)} className={`${inputCls} !w-auto min-w-[260px]`}>
                <option value="">— Choisir —</option>
                {sameDate.length > 0 && (
                  <optgroup label={`Onglets du ${fmtDay(date)}`}>
                    {sameDate.map(({ t }) => (
                      <option key={t.name} value={t.name}>
                        {t.name} — {t.meta.distribution || "lieu inconnu"}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Tous les onglets">
                  {ranked
                    .filter((r) => r.t.meta.date !== date)
                    .map(({ t }) => (
                      <option key={t.name} value={t.name}>
                        {t.name} — {t.meta.distribution || "lieu inconnu"} · {fmtDay(t.meta.date)}
                      </option>
                    ))}
                </optgroup>
              </select>
              {current && !mismatch && <span className="rounded-[40px] bg-[var(--good-bg)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--good)]">Onglet reconnu : même date</span>}
              {mismatch && <span className="rounded-[40px] bg-[var(--warn-bg)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--warn)]">⚠︎ Cet onglet est daté du {fmtDay(current!.meta.date)}</span>}
            </div>

            {current && (
              <>
                <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ["Lieu (fichier)", current.meta.distribution || "—"],
                    ["Inscrits", current.meta.registered || "—"],
                    ["Taux de présence", current.meta.presence ? `${current.meta.presence} %` : "—"],
                    ["Paniers", current.meta.baskets || "—"],
                    ["F&L cible", current.meta.flTarget ? `${current.meta.flTarget} kg` : "—"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-[var(--track)] px-3 py-2">
                      <div className="text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{l}</div>
                      <div className="truncate font-display text-[15px] font-black text-[var(--navy)]">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="max-h-[300px] overflow-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-left text-[12px]">
                    <thead className="sticky top-0 bg-[var(--input-bg)] text-[10.5px] tracking-[0.03em] text-[var(--slate)] uppercase">
                      <tr>
                        {["Catégorie", "Produit", "Nb colis", "Pds colis", "Poids (kg)", "Fournisseur", "Mode de livraison"].map((h) => (
                          <th key={h} className="px-2.5 py-1.5 font-bold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {current.lines.map((l, i) => (
                        <tr key={i} className="border-t border-[var(--border)] text-[var(--navy)]">
                          <td className="px-2.5 py-1.5">{l.category}</td>
                          <td className="px-2.5 py-1.5 font-semibold">{l.product}</td>
                          <td className="px-2.5 py-1.5 tabular-nums">{l.nb_colis || "—"}</td>
                          <td className="px-2.5 py-1.5 tabular-nums">{l.colis_weight_kg || "—"}</td>
                          <td className="px-2.5 py-1.5 tabular-nums">{l.weight_kg || "—"}</td>
                          <td className="px-2.5 py-1.5">{l.supplier || "—"}</td>
                          <td className="px-2.5 py-1.5">{l.delivery_mode || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">
                  {current.lines.length} ligne(s) · {totalKg.toLocaleString("fr-FR")} kg au total{current.skipped ? ` · ${current.skipped} ligne(s) du modèle sans quantité ignorée(s)` : ""}. Les cellules en erreur du fichier (#REF!, #DIV/0!) sont laissées vides.
                </p>

                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3">
                  <div className="flex flex-wrap gap-4 text-[12.5px] font-semibold text-[var(--navy)]">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="imp-mode" checked={mode === "append"} onChange={() => setMode("append")} />
                      Ajouter à la suite du tableau
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="imp-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                      Remplacer le tableau actuel
                    </label>
                  </div>
                  {mode === "replace" && hasLines && <p className="text-[11.5px] font-semibold text-[var(--critical)]">Les lignes actuellement saisies seront remplacées par celles du fichier.</p>}
                  <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--navy)]">
                    <input type="checkbox" checked={withMeta} onChange={(e) => setWithMeta(e.target.checked)} />
                    Remplir aussi les inscrits, le taux de présence, les paniers et la cible F&amp;L (seulement ceux que le fichier renseigne)
                  </label>
                </div>
                <div className="mt-3 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onApply({ lines: current.lines, meta: current.meta, mode, withMeta });
                      onClose();
                    }}
                    className="rounded-[40px] bg-[#2a78d6] px-5 py-2.5 font-display text-[13.5px] font-bold text-white"
                  >
                    Importer {current.lines.length} ligne(s)
                  </button>
                  <button type="button" onClick={onClose} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2.5 font-display text-[13.5px] font-bold text-[var(--slate)]">
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
