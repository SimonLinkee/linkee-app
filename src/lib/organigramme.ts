"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Organigramme (migration 050) : l'équipe interne voit l'équipe de toutes les villes ; les Linkers (prénom + photo)
// seulement pour le Superadmin, la Comptabilité et l'antenne de leur ville. Tout vient de fonctions sécurisées.

export type TeamMember = { id: string; full_name: string | null; role: string; city_id: string | null; phone: string | null; email: string | null; photo_path: string | null };
export type TeamVehicle = { id: string; city_id: string; name: string; plate: string | null; vtype: string; assigned_name: string | null };
export type LinkerLite = { id: string; first_name: string; city_id: string; photo_path: string | null };
export type BoardMember = { slot: number; name: string; photo_path: string | null };
export type CityLite = { id: string; name: string; color: string | null };

export const BOARD_SLOTS = 7;

export function initialsOf(name: string | null | undefined) {
  return (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

const TINTS: [string, string][] = [["#CECBF6", "#26215C"], ["#9FE1CB", "#04342C"], ["#F5C4B3", "#4A1B0C"], ["#B5D4F4", "#042C53"], ["#FAC775", "#412402"], ["#F4C0D1", "#4B1528"], ["#C0DD97", "#173404"]];
export function tintFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % TINTS.length;
  return TINTS[h];
}

export function useOrganigramme() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<{ cities: CityLite[]; team: TeamMember[]; vehicles: TeamVehicle[]; linkers: LinkerLite[]; board: BoardMember[] } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [boardUrls, setBoardUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("cities").select("id,name,color").order("name"),
      supabase.rpc("team_directory"),
      supabase.rpc("team_vehicles"),
      supabase.rpc("linkers_directory"),
      supabase.from("board_members").select("slot,name,photo_path").order("slot"),
    ]).then(async ([c, t, v, l, b]) => {
      if (!alive) return;
      const err = t.error ?? v.error ?? l.error ?? b.error ?? c.error;
      if (err) setError(err.message + " (les migrations 049 et 050 sont-elles passées ?)");
      const team = (t.data ?? []) as TeamMember[];
      const linkers = (l.data ?? []) as LinkerLite[];
      const board = (b.data ?? []) as BoardMember[];
      setData({ cities: (c.data ?? []) as CityLite[], team, vehicles: (v.data ?? []) as TeamVehicle[], linkers, board });
      const avatarPaths = [...team, ...linkers].map((x) => x.photo_path).filter((p): p is string => !!p);
      const boardPaths = board.map((x) => x.photo_path).filter((p): p is string => !!p);
      if (avatarPaths.length) {
        const { data: s } = await supabase.storage.from("avatars").createSignedUrls(avatarPaths, 3600);
        if (alive) setUrls(Object.fromEntries(avatarPaths.map((p, i) => [p, s?.[i]?.signedUrl ?? ""])));
      } else setUrls({});
      if (boardPaths.length) {
        const { data: s } = await supabase.storage.from("board").createSignedUrls(boardPaths, 3600);
        if (alive) setBoardUrls(Object.fromEntries(boardPaths.map((p, i) => [p, s?.[i]?.signedUrl ?? ""])));
      } else setBoardUrls({});
    });
    return () => {
      alive = false;
    };
  }, [supabase, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, urls, boardUrls, error, reload };
}
