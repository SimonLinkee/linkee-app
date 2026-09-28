"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export type City = { id: string; name: string; color: string; depot_address: string };

// Palette used for cities that have no colour yet.
export const CITY_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#B23B72", "#7C5CD9", "#eda100", "#0e9aa7", "#8a5a2b"];
export const DEFAULT_DEPOT = "110 Rue du Companet, 69140 Rillieux-la-Pape";

type Ctx = {
  ready: boolean;
  role: string;
  cities: City[];
  /** selected city, null when browsing "all cities" (national view) */
  city: City | null;
  cityId: string | null;
  isAll: boolean;
  /** only the main admin can switch; a local admin is locked on his own city */
  canSwitch: boolean;
  select: (idOrAll: string) => void;
  reloadCities: () => Promise<void>;
  depotAddress: string;
};

const CityCtx = createContext<Ctx>({
  ready: false, role: "", cities: [], city: null, cityId: null, isAll: false, canSwitch: false, select: () => {}, reloadCities: async () => {}, depotAddress: DEFAULT_DEPOT,
});
export const useCity = () => useContext(CityCtx);

const KEY = "linkee.city";

export function CityProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [own, setOwn] = useState<string | null>(null);
  const [selection, setSelection] = useState<string>(""); // city id or "all"

  async function loadCities() {
    let res = await supabase.from("cities").select("id,name,color,depot_address").order("name");
    if (res.error) res = (await supabase.from("cities").select("id,name").order("name")) as typeof res; // before migration 011
    const list = ((res.data ?? []) as { id: string; name: string; color?: string | null; depot_address?: string | null }[]).map((c, i) => ({
      id: c.id,
      name: c.name,
      color: c.color || CITY_PALETTE[i % CITY_PALETTE.length],
      depot_address: c.depot_address || DEFAULT_DEPOT,
    }));
    setCities(list);
    return list;
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("profiles").select("role,city_id").eq("id", auth.user?.id ?? "").maybeSingle();
      const list = await loadCities();
      setRole(prof?.role ?? "");
      setOwn(prof?.city_id ?? null);
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(KEY);
      } catch {
        /* no storage */
      }
      const main = prof?.role === "admin_principal";
      const valid = saved === "all" || list.some((c) => c.id === saved);
      setSelection(main && saved && valid ? saved : (prof?.city_id ?? list[0]?.id ?? ""));
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const canSwitch = role === "admin_principal";
  const isAll = canSwitch && selection === "all";
  const city = isAll ? null : (cities.find((c) => c.id === selection) ?? cities.find((c) => c.id === own) ?? null);

  const value: Ctx = {
    ready,
    role,
    cities,
    city,
    cityId: city?.id ?? null,
    isAll,
    canSwitch,
    select: (v) => {
      if (!canSwitch) return;
      setSelection(v);
      try {
        window.localStorage.setItem(KEY, v);
      } catch {
        /* ignore */
      }
    },
    reloadCities: async () => {
      await loadCities();
    },
    depotAddress: city?.depot_address ?? DEFAULT_DEPOT,
  };
  return <CityCtx.Provider value={value}>{children}</CityCtx.Provider>;
}
