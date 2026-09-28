import type { SupabaseClient } from "@supabase/supabase-js";

// Status of a distribution, derived from its date and from whether the admin closed it.
export type DistribStatus = "avenir" | "encours" | "retard" | "cloture";

export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** À venir (before D-day) · En cours (D-day) · Clôturé (validated) · En retard (not closed by D+1). */
export function distribStatus(date: string, closed: boolean): DistribStatus {
  if (closed) return "cloture";
  const t = isoToday();
  if (date > t) return "avenir";
  if (date === t) return "encours";
  return "retard";
}

export const STATUS_UI: Record<DistribStatus, { label: string; bg: string; fg: string }> = {
  avenir: { label: "À venir", bg: "var(--track)", fg: "var(--slate)" },
  encours: { label: "En cours", bg: "rgba(42,120,214,0.16)", fg: "#2a78d6" },
  retard: { label: "À clôturer — en retard", bg: "var(--critical-bg)", fg: "var(--critical)" },
  cloture: { label: "Clôturé", bg: "var(--good-bg)", fg: "var(--good)" },
};

/** How many distributions of a city should have been closed by yesterday and are not (saved ones and planned drop-offs). */
export async function countLateDistributions(supabase: SupabaseClient, cityId: string): Promise<number> {
  const today = isoToday();
  const since = new Date(Date.now() - 90 * 86400000);
  const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const [b, d] = await Promise.all([
    supabase.from("beneficiaries").select("id,category,fiche").eq("city_id", cityId),
    supabase.from("distributions").select("beneficiary_id,event_date,status").eq("city_id", cityId).gte("event_date", sinceIso),
  ]);
  const ids = ((b.data ?? []) as { id: string; category: string | null; fiche: { pinned?: boolean } | null }[]).filter((x) => x.category === "Distribution Linkee" || x.fiche?.pinned).map((x) => x.id);
  if (!ids.length || d.error) return 0;
  const saved = (d.data ?? []) as { beneficiary_id: string; event_date: string; status: string }[];
  const closed = new Set(saved.filter((x) => x.status === "distribuee").map((x) => `${x.beneficiary_id}|${x.event_date}`));
  const late = new Set(saved.filter((x) => x.status !== "distribuee" && x.event_date < today).map((x) => `${x.beneficiary_id}|${x.event_date}`));
  const c = await supabase.from("collectes").select("beneficiary_id,scheduled_date").eq("city_id", cityId).eq("kind", "dropoff").eq("source", "planning").in("beneficiary_id", ids).gte("scheduled_date", sinceIso).lt("scheduled_date", today).neq("status", "annule");
  for (const r of (c.data ?? []) as { beneficiary_id: string; scheduled_date: string }[]) {
    const k = `${r.beneficiary_id}|${r.scheduled_date}`;
    if (!closed.has(k)) late.add(k);
  }
  return late.size;
}
