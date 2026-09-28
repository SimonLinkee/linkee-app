"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CharKey } from "@/lib/linker/characters";
import type { Mode, StyleKey } from "@/lib/linker/gamification";

export type LinkerRow = {
  id: string;
  city_id: string;
  character: CharKey;
  chosen: Record<number, StyleKey>;
  equipped: Record<number, number | "none">;
  cosmetics: { emoji?: string; bg?: string; hue?: number; owned?: { emoji?: Record<string, boolean>; bg?: Record<string, boolean>; color?: Record<string, boolean> } };
  mode: Mode;
  radius_km: number;
  cold_ok: boolean;
  address_ref: string | null;
  level: number;
  points: number;
  kg_saved: number;
  links_done: number;
};

type Ctx = {
  ready: boolean;
  userId: string | null;
  name: string;
  linker: LinkerRow | null;
  availability: Set<string>; // "weekday-slot"
  reload: () => Promise<void>;
  patchLinker: (p: Partial<LinkerRow>) => Promise<void>;
};

const LinkerCtx = createContext<Ctx>({ ready: false, userId: null, name: "", linker: null, availability: new Set(), reload: async () => {}, patchLinker: async () => {} });
export const useLinker = () => useContext(LinkerCtx);

/** Loads the signed-in Linker's profile once and redirects away if the account isn't (yet) a Linker. */
export function LinkerProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [linker, setLinker] = useState<LinkerRow | null>(null);
  const [availability, setAvailability] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return router.replace("/login");
    setUserId(auth.user.id);
    const [prof, lk, av] = await Promise.all([
      supabase.from("profiles").select("full_name,email,role").eq("id", auth.user.id).maybeSingle(),
      supabase.from("linkers").select("*").eq("id", auth.user.id).maybeSingle(),
      supabase.from("linker_availability").select("weekday,slot").eq("linker_id", auth.user.id),
    ]);
    if (prof.data?.role !== "linker" || !lk.data) return router.replace("/linker/inscription");
    setName(prof.data.full_name || prof.data.email?.split("@")[0] || "");
    setLinker(lk.data as unknown as LinkerRow);
    setAvailability(new Set(((av.data ?? []) as { weekday: number; slot: number }[]).map((r) => `${r.weekday}-${r.slot}`)));
    setReady(true);
  }, [supabase, router]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchLinker = useCallback(
    async (p: Partial<LinkerRow>) => {
      if (!userId) return;
      setLinker((prev) => (prev ? { ...prev, ...p } : prev));
      const { error } = await supabase.from("linkers").update(p).eq("id", userId);
      if (error) console.error(error.message);
    },
    [supabase, userId],
  );

  return <LinkerCtx.Provider value={{ ready, userId, name, linker, availability, reload: load, patchLinker }}>{children}</LinkerCtx.Provider>;
}
