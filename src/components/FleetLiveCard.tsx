"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const PointsMap = dynamic(() => import("@/components/PointsMap"), { ssr: false, loading: () => <div className="flex h-[280px] items-center justify-center text-[13px] text-[var(--slate)]">Chargement de la carte…</div> });

type Position = { lat: number; lng: number; state: string | null; battery: number | null; address: string | null; lastLocationDate: string | null; lastUplinkDate: string | null; stationaryMinutes: number | null };

const REFRESH_MS = 30_000;
const OFFLINE_AFTER_MIN = 30; // pas de nouvelle position depuis 30 minutes : on le dit

const ago = (iso: string | null, now: number) => {
  if (!iso) return "—";
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 48 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} jours`;
};
const fmtDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtStop = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`);

/** EXPÉRIMENTATION — position du camion de Lyon (tracker Invoxia), actualisée toutes les 30 s. Réservée à l'équipe (voir /api/flotte/position). */
export default function FleetLiveCard() {
  const [pos, setPos] = useState<Position | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/flotte/position", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok && j.ok) { setPos(j as Position); setErr(null); }
        else setErr(r.status === 503 ? "not_configured" : r.status === 403 || r.status === 401 ? "forbidden" : "unavailable");
      } catch {
        if (alive) setErr("unavailable");
      }
      if (alive) { setLoading(false); setNow(Date.now()); }
    }
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const ageMin = pos?.lastUplinkDate ? (now - new Date(pos.lastUplinkDate).getTime()) / 60000 : Infinity;
  const offline = !!pos && (pos.state === "offline" || ageMin > OFFLINE_AFTER_MIN);
  const points = useMemo(
    () => (pos ? [{ id: "camion", lat: pos.lat, lng: pos.lng, label: "Camion Lyon", sub: offline ? "dernière position connue" : pos.stationaryMinutes ? `à l'arrêt depuis ${fmtStop(pos.stationaryMinutes)}` : "en route", color: offline ? "#9aa3b8" : "#1baf7a" }] : []),
    [pos, offline],
  );

  return (
    <section className="mb-5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]" aria-label="Position du camion de Lyon">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-[18px] leading-none font-black text-[var(--navy)]">Position du camion · Lyon</h2>
        <span className="rounded-full bg-[var(--warn-bg)] px-2 py-[1px] text-[9px] leading-[1.5] font-extrabold tracking-[0.06em] text-[var(--warn)] uppercase">Expérimentation</span>
        {pos && (
          <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${offline ? "bg-[var(--track)] text-[var(--slate)]" : "bg-[var(--good-bg)] text-[var(--good)]"}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: offline ? "#9aa3b8" : "#1baf7a" }} />
            {offline ? "Tracker hors ligne" : "En ligne"}
          </span>
        )}
      </div>

      {loading && <p className="py-8 text-center text-[13px] text-[var(--slate)]">Recherche du camion…</p>}
      {!loading && err === "not_configured" && <p className="rounded-[14px] bg-[var(--warn-bg)] px-3.5 py-3 text-[13px] font-semibold text-[var(--navy)]">Le suivi GPS n&apos;est pas encore branché : la variable <code>INVOXIA_TRACKER_LYON</code> manque sur le serveur.</p>}
      {!loading && err === "forbidden" && <p className="rounded-[14px] bg-[var(--track)] px-3.5 py-3 text-[13px] font-semibold text-[var(--slate)]">La position du camion est réservée à l&apos;équipe de Lyon et aux administrateurs.</p>}
      {!loading && err === "unavailable" && !pos && <p className="rounded-[14px] bg-[var(--critical-bg)] px-3.5 py-3 text-[13px] font-semibold text-[var(--critical)]">Position indisponible pour le moment. Nouvel essai dans quelques secondes.</p>}

      {pos && (
        <>
          {offline && (
            <p className="mb-3 rounded-[14px] bg-[var(--warn-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--navy)]">
              Le tracker ne remonte plus de position{pos.lastLocationDate ? ` depuis le ${fmtDate(pos.lastLocationDate)}` : ""}. La carte montre la dernière position connue{pos.battery === 0 ? " — sa batterie est à plat" : ""}.
            </p>
          )}
          <PointsMap points={points} selectedId="camion" onSelect={() => {}} height={280} />
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-[14px] bg-[var(--track)] px-3 py-2.5"><div className="text-[11px] font-bold text-[var(--slate)]">Dernière position</div><div className="text-[13px] font-extrabold text-[var(--navy)]">{ago(pos.lastLocationDate, now)}</div></div>
            <div className="rounded-[14px] bg-[var(--track)] px-3 py-2.5"><div className="text-[11px] font-bold text-[var(--slate)]">Adresse</div><div className="text-[13px] font-extrabold text-[var(--navy)]">{pos.address ?? "—"}</div></div>
            <div className="rounded-[14px] bg-[var(--track)] px-3 py-2.5"><div className="text-[11px] font-bold text-[var(--slate)]">À l&apos;arrêt depuis</div><div className="text-[13px] font-extrabold text-[var(--navy)]">{!offline && pos.stationaryMinutes != null ? fmtStop(pos.stationaryMinutes) : "—"}</div></div>
            <div className="rounded-[14px] bg-[var(--track)] px-3 py-2.5"><div className="text-[11px] font-bold text-[var(--slate)]">Batterie du tracker</div><div className="text-[13px] font-extrabold text-[var(--navy)]">{pos.battery != null ? `${pos.battery} %` : "—"}</div></div>
          </div>
          <p className="mt-2.5 text-[11px] text-[var(--muted)]">Source : tracker Invoxia · actualisé toutes les 30 secondes · visible par l&apos;équipe uniquement.</p>
        </>
      )}
    </section>
  );
}
