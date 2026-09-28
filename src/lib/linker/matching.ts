// Links Bénévoles — matching: which beneficiary (association) is the nearest one open on a given day,
// using real geocoded coordinates (api-adresse.data.gouv.fr, the same source already used for routing
// elsewhere in the app) and straight-line distance. No PostGIS needed at this scale.
import type { SupabaseClient } from "@supabase/supabase-js";
import { geocode, toKm, type LatLng } from "@/lib/geocode";
import { openDays } from "@/components/partner/BeneficiaryMap";

export type MatchResult = { id: string; name: string; address: string; distanceKm: number };

/** Weekday index used by the "horaires" free-text parser: 0 = Monday … 6 = Sunday. */
export function appWeekday(dateIso: string): number {
  const js = new Date(dateIso + "T00:00:00").getDay(); // 0 = Sunday … 6 = Saturday
  return (js + 6) % 7;
}

/**
 * Nearest active beneficiary of `cityId` known to be open on `dateIso`'s weekday, by straight-line distance
 * from `fromAddress`. A beneficiary whose "horaires" can't be read is treated as open (benefit of the doubt) —
 * only one explicitly marked closed that day is excluded. Returns null when nothing matches (partner address
 * un-geocodable, or no beneficiary at all).
 */
export async function matchNearestOpenBeneficiary(supabase: SupabaseClient, cityId: string, fromAddress: string, dateIso: string): Promise<MatchResult | null> {
  const origin = await geocode(fromAddress);
  if (!origin) return null;
  const { data } = await supabase.from("beneficiaries").select("id,name,address,active,fiche").eq("city_id", cityId).eq("active", true);
  const rows = (data ?? []) as { id: string; name: string; address: string | null; fiche: { horaires?: string } | null }[];
  const weekday = appWeekday(dateIso);
  const candidates: MatchResult[] = [];
  for (const b of rows) {
    if (!b.address) continue;
    const od = openDays(b.fiche?.horaires || "");
    if (od && !od.has(weekday)) continue; // explicitly known to be closed that day
    const g = await geocode(b.address);
    if (!g) continue;
    const d = toKm(g, origin);
    candidates.push({ id: b.id, name: b.name, address: b.address, distanceKm: Math.round(Math.hypot(d.x, d.y) * 10) / 10 });
  }
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates[0] ?? null;
}

/** True straight-line distance in km between two addresses (both geocoded), or null if either can't be located. */
export async function distanceBetween(a: string, b: string): Promise<number | null> {
  const [ga, gb] = await Promise.all([geocode(a), geocode(b)]);
  if (!ga || !gb) return null;
  const d = toKm(gb, ga);
  return Math.round(Math.hypot(d.x, d.y) * 10) / 10;
}
export type { LatLng };
