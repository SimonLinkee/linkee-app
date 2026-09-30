import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Real road routing for the planning map.
// Uses OpenRouteService when ORS_API_KEY is set (free key, 2 000 requests/day), otherwise the public OSRM demo server.
// Kept on the server so keys never reach the browser and only signed-in users can use it.

type Pt = { lat: number; lng: number };
type RouteResult = { legs: { seconds: number; meters: number }[]; geometry: [number, number][]; provider: "ors" | "osrm" };

async function viaOrs(points: Pt[], key: string): Promise<RouteResult> {
  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]) }),
  });
  if (!res.ok) throw new Error(`OpenRouteService ${res.status}`);
  const json = await res.json();
  const f = json.features?.[0];
  if (!f) throw new Error("Itinéraire introuvable");
  return {
    legs: (f.properties.segments as { duration: number; distance: number }[]).map((s) => ({ seconds: s.duration, meters: s.distance })),
    geometry: (f.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
    provider: "ors",
  };
}

async function viaOsrm(points: Pt[]): Promise<RouteResult> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  const r = json.routes?.[0];
  if (json.code !== "Ok" || !r) throw new Error("Itinéraire introuvable");
  return {
    legs: (r.legs as { duration: number; distance: number }[]).map((l) => ({ seconds: l.duration, meters: l.distance })),
    geometry: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
    provider: "osrm",
  };
}

// Limite anti-abus par utilisateur (best-effort : en mémoire par instance serverless, donc pas garanti
// sur plusieurs instances, mais suffit à contrer un script naïf qui viserait à épuiser le quota ORS payant).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > RATE_LIMIT_WINDOW_MS) hits.delete(k);
  return recent.length > RATE_LIMIT_MAX;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (rateLimited(auth.user.id)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { points?: Pt[] } | null;
  const points = body?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 30 || points.some((p) => typeof p.lat !== "number" || typeof p.lng !== "number")) {
    return NextResponse.json({ error: "Points invalides" }, { status: 400 });
  }
  try {
    const key = process.env.ORS_API_KEY;
    const result = key ? await viaOrs(points, key).catch(() => viaOsrm(points)) : await viaOsrm(points);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
