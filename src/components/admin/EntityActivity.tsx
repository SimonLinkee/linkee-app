"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isCollectKind, isoOf } from "@/lib/stats";
import { openPrivateFile, signedUrls, type TeamFile } from "@/lib/photos";

type Item = { denree: string | null; kg: number | string | null };
type Row = { id: string; scheduled_date: string; scheduled_time: string | null; kind: string; status: string; motif: string | null; source: string | null; photo_paths: string[] | null; collecte_items: Item[] | null };

const SHOWN = 6;
const SHOWN_ALL = 60;
const day = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return { dow: d.toLocaleDateString("fr-FR", { weekday: "short" }), dom: d.getDate(), month: d.toLocaleDateString("fr-FR", { month: "short" }), year: d.getFullYear() };
};
const sum = (items: Item[] | null) => Math.round((items ?? []).reduce((s, i) => s + (Number(i.kg) || 0), 0) * 10) / 10;
const denrees = (items: Item[] | null) => Array.from(new Set((items ?? []).map((i) => i.denree).filter(Boolean))).join(", ");

/** Photos (vignettes, clic = ouvrir) et fichiers (clic = ouvrir) d'une collecte. */
function Media({ photos, files }: { photos: string[]; files: TeamFile[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    signedUrls(supabase, photos).then((u) => {
      if (live) setUrls(u);
    });
    return () => {
      live = false;
    };
  }, [supabase, photos]);
  return (
    <div className="mt-2 ml-[64px] flex flex-wrap items-start gap-2">
      {photos.map((p, i) => (
        <a key={p} href={urls[i] || undefined} target="_blank" rel="noopener noreferrer" title="Ouvrir la photo" className="h-[76px] w-[76px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--track)]">
          {urls[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[i]} alt="Photo de la collecte" className="h-full w-full object-cover" />
          )}
        </a>
      ))}
      {files.map((f) => (
        <button key={f.path} type="button" onClick={() => void openPrivateFile(supabase, f.path)} title={`Ouvrir ${f.name}`} className="flex max-w-[240px] items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[11.5px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)]">
          📎 <span className="truncate">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

function Line({ r, past, today, files, open, onToggle }: { r: Row; past: boolean; today: string; files: TeamFile[]; open: boolean; onToggle: () => void }) {
  const d = day(r.scheduled_date);
  const photos = r.photo_paths ?? [];
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
  const hasMedia = photos.length > 0 || files.length > 0;
  return (
    <div className="border-b border-[var(--border)] py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="w-[52px] flex-none text-center">
          <span className="block text-[10px] font-bold text-[var(--slate)] uppercase">{d.dow}</span>
          <span className="block font-display text-[20px] leading-none font-black text-[var(--navy)]">{d.dom}</span>
          <span className="block text-[10px] text-[var(--slate)]">
            {d.month}
            {d.year !== new Date().getFullYear() ? ` ${d.year}` : ""}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--slate)]" title={note}>
          {note}
        </span>
        {hasMedia && (
          <button
            type="button"
            onClick={onToggle}
            title="Voir les photos et fichiers de cette collecte"
            className={`flex-none rounded-[40px] border-[1.5px] px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap text-[var(--navy)] ${open ? "border-[var(--turquoise)] bg-[var(--input-bg)]" : "border-[var(--border)] hover:border-[var(--turquoise)]"}`}
          >
            {photos.length > 0 && <>📷 {photos.length}</>}
            {photos.length > 0 && files.length > 0 && " · "}
            {files.length > 0 && <>📎 {files.length}</>}
          </button>
        )}
        <span className="flex-none rounded-[40px] px-2.5 py-[5px] text-[10px] font-bold whitespace-nowrap uppercase" style={{ background: bg, color: fg }}>
          {badge}
        </span>
      </div>
      {open && hasMedia && <Media photos={photos} files={files} />}
    </div>
  );
}

/** Pilotage (Superadmin, Comptabilité) : quand le tableau de bord est isolé sur un partenaire ou un lieu de dépose,
 * son historique (poids saisi total, photos et fichiers de chaque collecte) passe en tête de page, avec en dessous
 * ses prochaines collectes / livraisons. Indépendant de la période du tableau de bord : toujours les plus récentes. */
export default function EntityActivity({ kind, id }: { kind: "partner" | "beneficiary"; id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [filesBy, setFilesBy] = useState<Record<string, TeamFile[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const today = isoOf(new Date());
  const isPartner = kind === "partner";

  useEffect(() => {
    const col = isPartner ? "partner_id" : "beneficiary_id";
    supabase
      .from("collectes")
      .select("id,scheduled_date,scheduled_time,kind,status,motif,source,photo_paths,collecte_items!collecte_id(denree,kg)")
      .eq(col, id)
      .order("scheduled_date", { ascending: false })
      .limit(500)
      .then(({ data, error: err }) => {
        if (err) return setError(err.message);
        const list = (data ?? []) as unknown as Row[];
        setRows(list.filter((r) => (isPartner ? isCollectKind(r.kind) : r.kind === "dropoff")));
      });
    // fichiers joints par l'équipe (migration 074) : requête à part, sans conséquence si la migration n'est pas passée
    supabase
      .from("collectes")
      .select("id,team_files")
      .eq(col, id)
      .neq("team_files", "[]")
      .then(({ data, error: err }) => {
        if (err || !data) return;
        setFilesBy(Object.fromEntries((data as { id: string; team_files: TeamFile[] | null }[]).map((r) => [r.id, r.team_files ?? []])));
      });
  }, [supabase, id, isPartner]);

  const list = rows ?? [];
  const upcoming = list.filter((r) => (r.status === "todo" || r.status === "en_attente") && r.scheduled_date >= today).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
  const history = list.filter((r) => r.status === "collecte" || r.status === "annule" || (r.status === "todo" && r.scheduled_date < today)); // déjà triées du plus récent au plus ancien
  const cap = all ? SHOWN_ALL : SHOWN;
  const noun = isPartner ? "collectes" : "livraisons";
  const one = isPartner ? "collecte" : "livraison";

  const done = history.filter((r) => r.status === "collecte");
  const totalKg = Math.round(done.reduce((t, r) => t + sum(r.collecte_items), 0) * 10) / 10;
  const nbPhotos = done.reduce((t, r) => t + (r.photo_paths?.length ?? 0), 0);
  const nbFiles = done.reduce((t, r) => t + (filesBy[r.id]?.length ?? 0), 0);
  const toggle = (rid: string) => setOpenId((cur) => (cur === rid ? null : rid));

  const card = "rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]";
  return (
    <section className="mb-[22px] flex flex-col gap-4">
      {error && <div className="rounded-xl bg-[var(--critical-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--critical)]">Chargement impossible : {error}</div>}

      <div className={card}>
        <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Historique des {noun}</h3>
        <p className="mb-3 text-[11.5px] text-[var(--slate)]">Les plus récentes d&apos;abord · cliquez sur 📷 / 📎 pour voir les photos et fichiers rattachés à chaque {one}</p>
        {rows !== null && done.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              [isPartner ? "Collectes réalisées" : "Livraisons réalisées", String(done.length)],
              ["Poids saisi (total)", `${totalKg.toLocaleString("fr-FR")} kg`],
              ["Photos", String(nbPhotos)],
              ["Fichiers", String(nbFiles)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[var(--track)] px-3.5 py-2.5">
                <div className="text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{l}</div>
                <div className="font-display text-[19px] font-black text-[var(--navy)]">{v}</div>
              </div>
            ))}
          </div>
        )}
        {rows === null ? (
          <p className="text-[12px] text-[var(--slate)]">Chargement…</p>
        ) : history.length === 0 ? (
          <p className="text-[12px] text-[var(--slate)]">Aucun historique pour l&apos;instant.</p>
        ) : (
          history.slice(0, cap).map((r) => <Line key={r.id} r={r} past today={today} files={filesBy[r.id] ?? []} open={openId === r.id} onToggle={() => toggle(r.id)} />)
        )}
        {history.length > SHOWN && (
          <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[12.5px] font-bold text-[var(--turquoise)]">
            {all ? "Réduire" : `Tout afficher (${Math.min(history.length, SHOWN_ALL)})`}
          </button>
        )}
      </div>

      <div className={card}>
        <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Prochaines {noun}</h3>
        <p className="mb-2 text-[11.5px] text-[var(--slate)]">Planifiées à partir d&apos;aujourd&apos;hui{upcoming.length ? ` · ${upcoming.length}` : ""}</p>
        {rows === null ? (
          <p className="text-[12px] text-[var(--slate)]">Chargement…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-[12px] text-[var(--slate)]">Aucune {isPartner ? "collecte planifiée" : "livraison planifiée"} pour l&apos;instant.</p>
        ) : (
          upcoming.slice(0, SHOWN_ALL).map((r) => <Line key={r.id} r={r} past={false} today={today} files={filesBy[r.id] ?? []} open={openId === r.id} onToggle={() => toggle(r.id)} />)
        )}
      </div>
    </section>
  );
}
