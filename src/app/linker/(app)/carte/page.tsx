"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLinker } from "@/components/linker/LinkerContext";
import { geocode, toKm, type LatLng } from "@/lib/geocode";
import { MAX_KG } from "@/lib/linker/gamification";
import type { ClickPoint } from "@/components/PointsMap";

const PointsMap = dynamic(() => import("@/components/PointsMap"), { ssr: false, loading: () => <div className="flex h-[380px] items-center justify-center text-[13px] text-[var(--slate)]">Chargement de la carte…</div> });

type Rel = { name: string; address: string | null; allow_backpack?: boolean; allow_car?: boolean } | null;
type LinkRow = {
  id: string; kg_estime: number; is_fresh: boolean; mode_required: "walk" | "car";
  window_date: string; window_from: string; window_to: string; partners: Rel; beneficiaries: Rel;
};

const fmtWin = (r: LinkRow) => `${r.window_from.slice(0, 5)} – ${r.window_to.slice(0, 5)}`;
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export default function LinkerCartePage() {
  const { ready, linker } = useLinker();
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [coords, setCoords] = useState<Record<string, LatLng | null>>({});
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"map" | "list">("map");

  useEffect(() => {
    if (!ready || !linker) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("links")
        .select("id,kg_estime,is_fresh,mode_required,window_date,window_from,window_to,partners(name,address,allow_backpack,allow_car),beneficiaries(name,address)")
        .eq("status", "proposee")
        .order("window_date");
      setRows((data ?? []) as unknown as LinkRow[]);
      setLoading(false);
    })();
  }, [ready, linker]);

  // the Linker's position: browser geolocation if granted, else their reference address
  useEffect(() => {
    if (!linker) return;
    let done = false;
    const fallback = () => { if (!done && linker.address_ref) geocode(linker.address_ref).then(setOrigin); };
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { done = true; setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        fallback,
        { timeout: 4000 },
      );
      const t = setTimeout(fallback, 4200);
      return () => clearTimeout(t);
    }
    fallback();
  }, [linker]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const r of rows) {
        if (cancelled) return;
        const addr = r.partners?.address;
        if (!addr || coords[addr] !== undefined) continue;
        const g = await geocode(addr);
        if (cancelled) return;
        setCoords((prev) => ({ ...prev, [addr]: g }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const compatible = useMemo(() => {
    if (!linker) return [];
    // L'option voiture est retirée : toutes les collectes se font en sac à dos / vélo désormais.
    return rows.filter((r) => {
      if (r.kg_estime > MAX_KG.walk) return false;
      if (r.is_fresh && !linker.cold_ok) return false;
      if (!r.partners?.allow_backpack) return false;
      return true;
    });
  }, [rows, linker]);

  const withDist = useMemo(
    () =>
      compatible
        .map((r) => {
          const addr = r.partners?.address;
          const g = addr ? coords[addr] : null;
          const dist = g && origin ? Math.hypot(toKm(g, origin).x, toKm(g, origin).y) : null;
          return { r, g, dist };
        })
        .filter((x) => !linker || x.dist == null || x.dist <= linker.radius_km)
        .sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999)),
    [compatible, coords, origin, linker],
  );

  const points: ClickPoint[] = withDist.filter((x) => x.g).map((x) => ({ id: x.r.id, lat: x.g!.lat, lng: x.g!.lng, label: x.r.partners?.name ?? "Link", sub: `${fmtWin(x.r)} · ${x.r.kg_estime} kg`, color: x.r.is_fresh ? "#4fc1d6" : x.r.kg_estime > 25 ? "#2a78d6" : "#ff9a3c" }));

  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[24px] leading-none font-black text-[var(--navy)]">{withDist.length} Link{withDist.length > 1 ? "s" : ""} pour toi</h1>
        <div className="flex rounded-[40px] bg-[var(--track)] p-1">
          {(["map", "list"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-[40px] px-3 py-1.5 text-[13px] font-bold ${view === v ? "bg-[var(--card)] shadow" : "text-[var(--slate)]"}`}>
              {v === "map" ? "🗺️" : "☰"}
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-1 text-[12px] font-semibold text-[var(--slate)]">
        {linker.transport === "velo" ? "🚲 Vélo" : "🚶 À pied"} · rayon {linker.radius_km} km{linker.cold_ok ? " · 🧊 frais OK" : ""}
      </p>

      {loading ? (
        <p className="py-10 text-center text-[13px] text-[var(--slate)]">Chargement des Links…</p>
      ) : withDist.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[13px] font-semibold text-[var(--slate)]">
          Aucun Link ne correspond à ton profil pour l&apos;instant. Reviens plus tard, ou élargis ton rayon dans ton profil.
        </p>
      ) : view === "map" ? (
        <PointsMap points={points} selectedId={null} onSelect={(id) => (window.location.href = `/linker/link/${id}`)} height={420} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {withDist.map(({ r, dist }) => (
            <Link key={r.id} href={`/linker/link/${r.id}`} className="flex items-center gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] text-[22px]" style={{ background: r.is_fresh ? "#e0f4f7" : "#fff3c4" }}>
                {r.is_fresh ? "🧊" : r.kg_estime > 25 ? "🚗" : "🎒"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[16px] font-extrabold text-[var(--navy)]">{r.partners?.name}</span>
                <span className="block text-[12px] font-semibold text-[var(--slate)]">{fmtDay(r.window_date)} · {fmtWin(r)} · {r.kg_estime} kg</span>
              </span>
              {dist != null && (
                <span className="text-right">
                  <span className="block font-display text-[17px] font-black" style={{ color: "#eb6834" }}>{dist.toFixed(1)} km</span>
                  <span className="block text-[10.5px] font-bold text-[var(--good)]">+1 level</span>
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
