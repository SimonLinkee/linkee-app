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

/** Liste des fichiers d'une collecte (clic = ouvrir). */
function FileList({ files }: { files: TeamFile[] }) {
  const supabase = useMemo(() => createClient(), []);
  return (
    <div className="mt-2 ml-[64px] flex flex-wrap items-start gap-2">
      {files.map((f) => (
        <button key={f.path} type="button" onClick={() => void openPrivateFile(supabase, f.path)} title={`Ouvrir ${f.name}`} className="flex max-w-[260px] items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[11.5px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)]">
          📎 <span className="truncate">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

/** Visionneuse de photos : grande photo, précédente / suivante, ouverture dans un nouvel onglet. */
function PhotoViewer({ title, paths, onClose }: { title: string; paths: string[]; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [urls, setUrls] = useState<string[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    let live = true;
    signedUrls(supabase, paths).then((u) => {
      if (live) setUrls(u);
    });
    return () => {
      live = false;
    };
  }, [supabase, paths]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(paths.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paths.length, onClose]);
  const url = urls[i];
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/85 p-4" onClick={onClose} role="dialog" aria-label="Photos de la collecte">
      <div className="mb-3 flex items-center gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1 truncate text-[14px] font-bold capitalize">
          {title} · photo {i + 1} / {paths.length}
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-[40px] border border-white/40 px-3.5 py-1.5 text-[12.5px] font-bold hover:bg-white/10">
            Ouvrir dans un onglet
          </a>
        )}
        <button type="button" onClick={onClose} className="rounded-[40px] bg-white px-4 py-1.5 text-[12.5px] font-bold text-black">
          Fermer
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Photo de la collecte" className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <span className="text-[13px] text-white/80">Chargement…</span>
        )}
        {i > 0 && (
          <button type="button" onClick={() => setI(i - 1)} aria-label="Photo précédente" className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[22px] text-black">
            ‹
          </button>
        )}
        {i < paths.length - 1 && (
          <button type="button" onClick={() => setI(i + 1)} aria-label="Photo suivante" className="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[22px] text-black">
            ›
          </button>
        )}
      </div>
    </div>
  );
}

type LineProps = { files: TeamFile[]; open: boolean; onToggle: () => void; onPhotos: () => void; onFile: (f: TeamFile) => void };

function Line({ r, past, today, files, open, onToggle, onPhotos, onFile }: { r: Row; past: boolean; today: string } & LineProps) {
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
  const btn = "flex-none rounded-[40px] border-[1.5px] border-[var(--turquoise)] px-3 py-[3px] text-[11.5px] font-bold whitespace-nowrap text-[var(--navy)] hover:brightness-95";
  return (
    <div className="border-b border-[var(--border)] py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="w-[52px] flex-none text-center">
          <span className="block text-[10px] font-bold text-[var(--slate)] uppercase">{d.dow}</span>
          <span className="block font-display text-[20px] leading-none font-black text-[var(--navy)]">{d.dom}</span>
          <span className="block text-[10px] text-[var(--slate)]">
            {d.month}
            {d.year !== new Date().getFullYear() ? ` ${d.year}` : ""}
          </span>
        </span>
        <span className="min-w-[120px] flex-1 truncate text-[12.5px] text-[var(--slate)]" title={note}>
          {note}
        </span>
        {photos.length > 0 && (
          <button type="button" onClick={onPhotos} title="Consulter les photos de cette collecte" className={`${btn} bg-[var(--input-bg)]`}>
            📷 Photo{photos.length > 1 ? `s (${photos.length})` : ""}
          </button>
        )}
        {files.length > 0 && (
          <button
            type="button"
            onClick={() => (files.length === 1 ? onFile(files[0]) : onToggle())}
            title={files.length === 1 ? `Ouvrir ${files[0].name}` : "Voir les fichiers de cette collecte"}
            className={`${btn} ${open ? "bg-[var(--track)]" : "bg-[var(--input-bg)]"}`}
          >
            📎 Fichier{files.length > 1 ? `s (${files.length})` : ""}
          </button>
        )}
        <span className="flex-none rounded-[40px] px-2.5 py-[5px] text-[10px] font-bold whitespace-nowrap uppercase" style={{ background: bg, color: fg }}>
          {badge}
        </span>
      </div>
      {open && files.length > 1 && <FileList files={files} />}
    </div>
  );
}

/** Pilotage (Superadmin, Comptabilité) : quand le tableau de bord est isolé sur un partenaire ou un lieu de dépose,
 * son historique (poids saisi total, boutons Photo / Fichier sur chaque collecte) passe en tête de page, avec en dessous
 * ses prochaines collectes / livraisons. Indépendant de la période du tableau de bord : toujours les plus récentes. */
export default function EntityActivity({ kind, id }: { kind: "partner" | "beneficiary"; id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [filesBy, setFilesBy] = useState<Record<string, TeamFile[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ title: string; paths: string[] } | null>(null);
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
  const lineProps = (r: Row): LineProps => ({
    files: filesBy[r.id] ?? [],
    open: openId === r.id,
    onToggle: () => setOpenId((cur) => (cur === r.id ? null : r.id)),
    onPhotos: () => setViewer({ title: new Date(r.scheduled_date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), paths: r.photo_paths ?? [] }),
    onFile: (f) => void openPrivateFile(supabase, f.path),
  });

  const card = "rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]";
  return (
    <section className="mb-[22px] flex flex-col gap-4">
      {error && <div className="rounded-xl bg-[var(--critical-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--critical)]">Chargement impossible : {error}</div>}
      {viewer && <PhotoViewer title={viewer.title} paths={viewer.paths} onClose={() => setViewer(null)} />}

      <div className={card}>
        <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Historique des {noun}</h3>
        <p className="mb-3 text-[11.5px] text-[var(--slate)]">Les plus récentes d&apos;abord · boutons Photo / Fichier sur chaque {one} qui en a</p>
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
          history.slice(0, cap).map((r) => <Line key={r.id} r={r} past today={today} {...lineProps(r)} />)
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
          upcoming.slice(0, SHOWN_ALL).map((r) => <Line key={r.id} r={r} past={false} today={today} {...lineProps(r)} />)
        )}
      </div>
    </section>
  );
}
