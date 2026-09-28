"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Notif = { id: string; type: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

const TYPE_DOT: Record<string, string> = { request: "var(--client-req)", planning: "var(--turquoise)", cancel: "var(--critical)", day_closed: "var(--good)", mission: "var(--cat-2)" };

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/** Bell with unread badge; updates live through Supabase Realtime. `dark` = for use on the navy sidebar / header. */
export default function NotificationBell({ dark = false, align = "left" }: { dark?: boolean; align?: "left" | "right" }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  async function load() {
    const { data } = await supabase.from("notifications").select("id,type,title,body,link,created_at,read_at").order("created_at", { ascending: false }).limit(20);
    setItems((data ?? []) as Notif[]);
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      await load();
      channel = supabase
        .channel("notifications-" + auth.user.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${auth.user.id}` }, () => load())
        .subscribe();
    })();
    const poll = window.setInterval(load, 60000); // safety net if realtime is not enabled
    return () => {
      window.clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}
        className={`relative flex h-[34px] w-[34px] items-center justify-center rounded-full ${dark ? "text-[var(--panel-fg-dim)] hover:bg-white/10 hover:text-[var(--panel-fg)]" : "border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          <path d="M6 9 A6 6 0 0 1 18 9 C18 15 20 16 20 16 H4 C4 16 6 15 6 9 Z" />
          <path d="M10 19 A2 2 0 0 0 14 19" />
        </svg>
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--critical)] px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className={`absolute z-[1200] mt-2 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--navy)] shadow-[0_16px_36px_-12px_rgba(0,22,65,0.4)] ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="font-display text-[15px] font-extrabold">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))} className="text-[11.5px] font-bold text-[var(--turquoise)]">
                Tout marquer comme lu
              </button>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-[var(--slate)]">Rien pour l&apos;instant.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  markRead([n.id]);
                  setOpen(false);
                  if (n.link) router.push(n.link);
                }}
                className={`flex w-full items-start gap-2.5 border-b border-[var(--border)] px-4 py-3 text-left last:border-none hover:bg-[var(--input-bg)] ${n.read_at ? "opacity-60" : ""}`}
              >
                <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: n.read_at ? "var(--muted)" : (TYPE_DOT[n.type] ?? "var(--turquoise)") }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold">{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-[12px] leading-[1.4] text-[var(--slate)]">{n.body}</span>}
                  <span className="mt-1 block text-[10.5px] text-[var(--muted)]">{ago(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
