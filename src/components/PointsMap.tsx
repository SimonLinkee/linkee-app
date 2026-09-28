"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type ClickPoint = { id: string; lat: number; lng: number; label: string; sub?: string; color: string };

/** OpenStreetMap map of clickable points (one marker each). Load it with next/dynamic({ ssr: false }). */
export default function PointsMap({ points, selectedId, onSelect, height = 380 }: { points: ClickPoint[]; selectedId: string | null; onSelect: (id: string) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef("");
  const pick = useRef(onSelect);
  pick.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([45.764, 4.8357], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    for (const p of points) {
      const sel = p.id === selectedId;
      const size = sel ? 34 : 24;
      const icon = L.divIcon({
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${p.color};border:${sel ? "4px solid #ffb703" : "2.5px solid #fff"};box-shadow:0 2px 6px rgba(0,0,0,.4);box-sizing:border-box"></div>`,
      });
      const tip = `<strong>${esc(p.label)}</strong>${p.sub ? `<br/>${esc(p.sub)}` : ""}`;
      L.marker([p.lat, p.lng], { icon, zIndexOffset: sel ? 1000 : 0 })
        .bindTooltip(tip, { direction: "top", offset: [0, -size / 2] })
        .on("click", () => pick.current(p.id))
        .addTo(g);
    }
    // re-centre only when the set of points changes, not when the selection does
    const key = points.map((p) => p.id).join(",");
    if (key !== fitted.current && points.length) {
      fitted.current = key;
      m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
    }
  }, [points, selectedId]);

  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-[var(--border)]" />;
}
