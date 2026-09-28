// Address → coordinates through the French national address API (api-adresse.data.gouv.fr).
// Results are cached in memory and localStorage so each address is looked up once.

export type LatLng = { lat: number; lng: number };

const mem = new Map<string, LatLng | null>();

export async function geocode(address: string): Promise<LatLng | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (mem.has(key)) return mem.get(key) ?? null;
  try {
    const cached = window.localStorage.getItem("geo:" + key);
    if (cached) {
      const v = JSON.parse(cached) as LatLng;
      mem.set(key, v);
      return v;
    }
  } catch {
    /* localStorage unavailable */
  }
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    if (!res.ok) return null;
    const json = await res.json();
    const c = json?.features?.[0]?.geometry?.coordinates as [number, number] | undefined;
    if (!c) {
      mem.set(key, null);
      return null;
    }
    const v = { lat: c[1], lng: c[0] };
    mem.set(key, v);
    try {
      window.localStorage.setItem("geo:" + key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
    return v;
  } catch {
    return null;
  }
}

/** Offset of p from origin, in km (x east, y south — ready for SVG). */
export function toKm(p: LatLng, origin: LatLng): { x: number; y: number } {
  const kmPerLat = 110.57;
  const kmPerLng = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (p.lng - origin.lng) * kmPerLng, y: (origin.lat - p.lat) * kmPerLat };
}
