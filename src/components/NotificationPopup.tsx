"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { syncPush } from "@/lib/push";

// À l'ouverture de l'appli (et à chaque retour au premier plan) : si la personne a un message non lu envoyé par l'équipe
// (ou une nouvelle mission), il s'affiche tout de suite en grand, sans avoir à ouvrir la cloche.
type Notif = { id: string; type: string; title: string; body: string | null; link: string | null; created_at: string };

export default function NotificationPopup() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [queue, setQueue] = useState<Notif[]>([]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let live = true;
    async function check() {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,created_at")
        .is("read_at", null)
        .in("type", ["message", "mission"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10);
      if (live) setQueue((data ?? []) as Notif[]);
    }
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !live) return;
      void check();
      void syncPush();
      channel = supabase
        .channel("popup-" + auth.user.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${auth.user.id}` }, () => void check())
        .subscribe();
    })();
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  const n = queue[0];
  if (!n) return null;

  async function markRead(id: string) {
    setQueue((q) => q.filter((x) => x.id !== id));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/55 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Nouveau message">
      <div className="w-full max-w-[440px] overflow-hidden rounded-[22px] bg-[var(--card)] text-[var(--navy)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2 bg-[var(--navy-deep)] px-5 py-3 text-[var(--panel-fg)]">
          <span className="rounded-[40px] bg-[var(--turquoise)] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.08em] text-[#04262e] uppercase">{n.type === "mission" ? "Mission" : "Nouveau message"}</span>
          <span className="ml-auto text-[11.5px] text-[var(--panel-fg-dim)]">{queue.length > 1 ? `${queue.length} non lus` : ""}</span>
        </div>
        <div className="px-5 pt-4 pb-5">
          <h2 className="font-display text-[22px] leading-tight font-black">{n.title}</h2>
          {n.body && <p className="mt-2 text-[14px] leading-[1.5] whitespace-pre-line text-[var(--slate)]">{n.body}</p>}
          <div className="mt-5 flex gap-2.5">
            <button type="button" onClick={() => void markRead(n.id)} className="min-h-[48px] flex-1 rounded-[40px] bg-[var(--navy-deep)] px-4 py-3 font-display text-[15px] font-bold text-[var(--panel-fg)]">
              J&apos;ai lu
            </button>
            {n.link && (
              <button
                type="button"
                onClick={() => {
                  const link = n.link as string;
                  void markRead(n.id).then(() => router.push(link));
                }}
                className="min-h-[48px] flex-1 rounded-[40px] border-[1.5px] border-[var(--navy-deep)] px-4 py-3 font-display text-[15px] font-bold text-[var(--navy-deep)]"
              >
                Ouvrir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
