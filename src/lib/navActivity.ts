"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Pastilles clignotantes du menu : « Calendrier et actu » et « TODO » clignotent quand quelqu'un d'autre y a ajouté
// quelque chose depuis ta dernière visite de la page. La date de dernière visite est gardée dans ce navigateur.

type Section = "calendar" | "todo";
const KEY = (s: Section) => `linkee.seen.${s}`;
const CAL_ROLES = ["admin_principal", "comptabilite", "admin_local", "resp_distribution", "resp_rh"];
const TODO_ROLES = ["admin_principal", "comptabilite", "admin_local"];

function seenAt(s: Section): string {
  try {
    let v = window.localStorage.getItem(KEY(s));
    if (!v) {
      v = new Date().toISOString(); // première fois : on ne clignote pas pour l'existant
      window.localStorage.setItem(KEY(s), v);
    }
    return v;
  } catch {
    return new Date().toISOString();
  }
}
function markSeen(s: Section) {
  try {
    window.localStorage.setItem(KEY(s), new Date().toISOString());
  } catch {
    /* pas de stockage : tant pis */
  }
}

export function useNavActivity(pathname: string, cityId: string | null, isAll: boolean, role: string) {
  const [n, setN] = useState({ calendar: 0, todo: 0 });

  useEffect(() => {
    if (!role) return;
    const supabase = createClient();
    let off = false;
    const here: Section | null = pathname.startsWith("/calendrier") ? "calendar" : pathname.startsWith("/todo") ? "todo" : null;
    if (here) markSeen(here);

    async function run() {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || off) return;
      const mine = (col: string) => `${col}.is.null,${col}.neq.${uid}`; // les ajouts des autres seulement
      const count = async (p: PromiseLike<{ count: number | null; error: unknown }>) => {
        try {
          const r = await p;
          return r.error ? 0 : (r.count ?? 0);
        } catch {
          return 0;
        }
      };
      let calendar = 0;
      let todo = 0;
      if (CAL_ROLES.includes(role) && here !== "calendar") {
        const since = seenAt("calendar");
        const [a, b, c] = await Promise.all([
          count(supabase.from("calendar_events").select("id", { count: "exact", head: true }).gt("created_at", since).or(mine("created_by"))),
          count(supabase.from("news").select("id", { count: "exact", head: true }).gt("created_at", since).or(mine("created_by"))),
          count(supabase.from("gallery_photos").select("id", { count: "exact", head: true }).gt("created_at", since).neq("author_id", uid)),
        ]);
        calendar = a + b + c;
      }
      if (TODO_ROLES.includes(role) && !isAll && cityId && here !== "todo") {
        const since = seenAt("todo");
        todo = await count(supabase.from("missions").select("id", { count: "exact", head: true }).eq("city_id", cityId).gt("created_at", since).or(mine("created_by")));
      }
      if (!off) setN({ calendar, todo });
    }

    const first = window.setTimeout(() => void run(), 0);
    const tick = window.setInterval(() => void run(), 60_000);
    const onVisible = () => document.visibilityState === "visible" && void run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off = true;
      window.clearTimeout(first);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, cityId, isAll, role]);

  return here0(pathname, n);
}

// sur la page elle-même, rien ne clignote (on y est déjà)
function here0(pathname: string, n: { calendar: number; todo: number }) {
  return {
    calendar: pathname.startsWith("/calendrier") ? 0 : n.calendar,
    todo: pathname.startsWith("/todo") ? 0 : n.todo,
  };
}