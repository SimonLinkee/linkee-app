import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// EXPÉRIMENTATION — position du camion d'une ville (Lyon, Montpellier), lue sur le lien public du tracker Invoxia.
// Le jeton du lien donne la position en direct du camion : il vit UNIQUEMENT dans une variable d'environnement
// (INVOXIA_TRACKER_LYON, INVOXIA_TRACKER_MONTPELLIER ; Vercel + .env.local), jamais dans le code (le dépôt est public)
// ni dans le navigateur. La route vérifie que l'appelant est de l'équipe autorisée, puis relaie quelques champs seulement.

export const dynamic = "force-dynamic";

const TRACKER_ENV: Record<string, string> = { Lyon: "INVOXIA_TRACKER_LYON", Montpellier: "INVOXIA_TRACKER_MONTPELLIER" };
const cache = new Map<string, { at: number; body: Record<string, unknown> }>(); // évite de solliciter Invoxia à chaque écran ouvert

export async function GET(request: Request) {
  const cityName = new URL(request.url).searchParams.get("city") ?? "Lyon";
  if (!TRACKER_ENV[cityName]) return NextResponse.json({ error: "unknown_city" }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("role,city_id,active").eq("id", auth.user.id).maybeSingle();
  if (!prof || prof.active === false) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Superadmin et Comptabilité : oui. Responsable d'antenne : seulement pour sa propre ville. Les autres rôles : non.
  let allowed = prof.role === "admin_principal" || prof.role === "comptabilite";
  if (!allowed && prof.role === "admin_local") {
    const { data: city } = await supabase.from("cities").select("id").eq("name", cityName).maybeSingle();
    allowed = !!city && city.id === prof.city_id;
  }
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const token = process.env[TRACKER_ENV[cityName]];
  if (!token) return NextResponse.json({ error: "not_configured", variable: TRACKER_ENV[cityName] }, { status: 503 });

  const hit = cache.get(cityName);
  if (hit && Date.now() - hit.at < 20_000) return NextResponse.json(hit.body);
  let j: Record<string, unknown>;
  try {
    const r = await fetch(`https://api.invoxia.com/pub/trackers/${encodeURIComponent(token)}/`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return NextResponse.json({ error: "invoxia", status: r.status }, { status: 502 });
    j = await r.json();
  } catch {
    return NextResponse.json({ error: "invoxia_unreachable" }, { status: 502 });
  }
  const lat = Number(j.lat), lng = Number(j.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "no_position" }, { status: 502 });
  const body = {
    ok: true,
    lat,
    lng,
    state: typeof j.state === "string" ? j.state : null, // "offline" quand le tracker ne remonte plus rien
    battery: typeof j.battery === "number" ? j.battery : null,
    address: typeof j.last_location === "string" ? j.last_location : null,
    lastLocationDate: typeof j.last_location_date === "string" ? j.last_location_date : null,
    lastUplinkDate: typeof j.last_uplink_date === "string" ? j.last_uplink_date : null,
    stationaryMinutes: typeof j.stationary_time === "number" ? j.stationary_time : null,
  };
  cache.set(cityName, { at: Date.now(), body });
  return NextResponse.json(body);
}
