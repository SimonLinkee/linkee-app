// Links Bénévoles — matching: which beneficiary (association) is the nearest one open on a given day,
// using real geocoded coordinates (api-adresse.data.gouv.fr, the same source already used for routing
// elsewhere in the app) and straight-line distance. No PostGIS needed at this scale.
import type { SupabaseClient } from "@supabase/supabase-js";
import { geocode, toKm, type LatLng } from "@/lib/geocode";
import { openDays, type DayHours } from "@/components/partner/BeneficiaryMap";

export type MatchResult = { id: string; name: string; address: string; distanceKm: number };

const DAY_KEYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/** Weekday index used by the "horaires" free-text parser: 0 = Monday … 6 = Sunday. */
export function appWeekday(dateIso: string): number {
  const js = new Date(dateIso + "T00:00:00").getDay(); // 0 = Sunday … 6 = Saturday
  return (js + 6) % 7;
}

/**
 * Nearest active beneficiary of `cityId` known to be open on `dateIso`'s weekday (and, when structured hours are
 * set on the fiche, actually open during [windowFrom, windowTo]), by straight-line distance from `fromAddress`.
 * Structured hours (`fiche.hours`, day → {open,close}|null, filled in on the beneficiary's fiche) take priority
 * when present; a beneficiary that hasn't set them yet falls back to the free-text "horaires" day parser, and one
 * with neither is treated as open (benefit of the doubt). Returns null when nothing matches.
 */
export async function matchNearestOpenBeneficiary(
  supabase: SupabaseClient,
  cityId: string,
  fromAddress: string,
  dateIso: string,
  windowFrom?: string,
  windowTo?: string,
): Promise<MatchResult | null> {
  const origin = await geocode(fromAddress);
  if (!origin) return null;
  const { data } = await supabase.from("beneficiaries").select("id,name,address,active,fiche").eq("city_id", cityId).eq("active", true).is("deleted_at", null);
  const rows = (data ?? []) as { id: string; name: string; address: string | null; fiche: { horaires?: string; hours?: Record<string, DayHours> } | null }[];
  const weekday = appWeekday(dateIso);
  const dayKey = DAY_KEYS[weekday];
  const candidates: MatchResult[] = [];
  for (const b of rows) {
    if (!b.address) continue;
    const hours = b.fiche?.hours;
    if (hours && Object.keys(hours).length > 0) {
      const h = hours[dayKey];
      if (h === null) continue; // explicitement fermé ce jour-là
      if (h && windowFrom && windowTo && (toMin(windowTo) <= toMin(h.open) || toMin(windowFrom) >= toMin(h.close))) continue; // pas ouvert pendant la fenêtre demandée
      // h === undefined (jour non renseigné) : bénéfice du doute, comme avant
    } else {
      const od = openDays(b.fiche?.horaires || "");
      if (od && !od.has(weekday)) continue; // explicitement connu comme fermé ce jour-là
    }
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
