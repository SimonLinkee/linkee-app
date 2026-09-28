"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { lat: number; lng: number; label: string; color: string; num: number | "home"; time?: string };

/** OpenStreetMap map with numbered stops and the road route. Load it with next/dynamic({ ssr: false }). */
export default function RouteMap({ points, line, height = 340 }: { points: MapPoint[]; line: [number, number][]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([45.764, 4.8357], 12); // Lyon
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
    const path = line.length > 1 ? line : points.map((p) => [p.lat, p.lng] as [number, number]);
    if (path.length > 1) {
      L.polyline(path, { color: "#001641", weight: 5, opacity: 0.35 }).addTo(g);
      L.polyline(path, { color: "#4FC1D6", weight: 3, opacity: 0.95 }).addTo(g);
    }
    for (const p of points) {
      const home = p.num === "home";
      const icon = L.divIcon({
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        html: `<div style="width:30px;height:30px;border-radius:50%;background:${p.color};color:#fff;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif">${home ? "⌂" : p.num}</div>`,
      });
      const tip = `<strong>${p.label.replace(/</g, "&lt;")}</strong>${p.time ? `<br/>${p.time}` : ""}`;
      L.marker([p.lat, p.lng], { icon }).bindTooltip(tip, { direction: "top", offset: [0, -14] }).addTo(g);
    }
    const all = [...path, ...points.map((p) => [p.lat, p.lng] as [number, number])];
    if (all.length) m.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 15 });
  }, [points, line]);

  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-[var(--border)]" />;
}
