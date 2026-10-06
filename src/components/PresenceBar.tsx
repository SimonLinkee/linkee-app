"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// « Qui est connecté » : pastilles en haut à droite, comme dans Google Drive. Présence temps réel (Supabase Realtime), rien
// n'est enregistré en base ; les canaux sont privés (migration 063) :
//   channel="team"    → l'équipe (Superadmin, Comptabilité, Responsable d'antenne)
//   channel="linkers" → les Linkers bénévoles, entre eux (prénom et initiale seulement)

type Who = { id: string; name: string; role: string; page: string; photo: string | null };

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#B23B72", "#7C5CD9", "#0e9aa7", "#8a5a2b", "#eda100"];
const colorOf = (id: string) => COLORS[Array.from(id).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % COLORS.length, 0)];
const ROLE_LABEL: Record<string, string> = { admin_principal: "Superadmin", comptabilite: "Comptabilité", admin_local: "Responsable d'antenne", logisticien: "Logisticien", linker: "Linker" };
const PAGES: [string, string][] = [
  ["/dashboard", "le tableau de bord"], ["/partenaires", "Partenaires"], ["/prospection", "Prospection"], ["/village-associatif", "le Village associatif"], ["/planning", "le Planning"],
  ["/calendrier", "Calendrier et actu"], ["/distributions", "Distributions"], ["/stock", "le Stock"], ["/flotte", "la Flotte"], ["/todo", "TODO"], ["/comptabilite", "Cerfa"],
  ["/links-benevoles", "Link citoyen"], ["/valeur-des-dons", "la Valeur des dons"], ["/organigramme", "l'Organigramme"], ["/remontees", "Remontées"], ["/profil", "son profil"],
  ["/villes-comptes", "Villes et comptes"], ["/historique", "l'Historique"], ["/journee", "Ma journée"],
];
const pageLabel = (path: string) => PAGES.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? "la plateforme";
const initial = (n: string) => (n.trim().charAt(0) || "?").toUpperCase();

export default function PresenceBar({ channel, max = 5, className = "" }: { channel: "team" | "linkers"; max?: number; className?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [people, setPeople] = useState<Who[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const me = useRef<Who | null>(null);
  const pathRef = useRef(pathname);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || off) return;
      const uid = auth.user.id;
      const { data: p } = await supabase.from("profiles").select("full_name,email,role,photo_path").eq("id", uid).maybeSingle();
      if (off) return;
      const full = ((p?.full_name as string | null) || (p?.email as string | null)?.split("@")[0] || "Équipe Linkee").trim();
      const parts = full.split(/\s+/);
      const name = channel === "linkers" ? (parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0]) : full;
      me.current = { id: uid, name, role: (p?.role as string) ?? "", page: pageLabel(pathRef.current), photo: channel === "team" ? ((p?.photo_path as string | null) ?? null) : null };
      setMeId(uid);
      await supabase.realtime.setAuth();
      const ch = supabase.channel(`presence:${channel}`, { config: { private: true, presence: { key: uid } } });
      chan.current = ch;
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, Who[]>;
        const list = Object.values(state).map((arr) => arr[arr.length - 1]).filter((w): w is Who => !!w && !!w.id);
        setPeople(list);
      }).subscribe(async (status) => {
        if (status === "SUBSCRIBED" && me.current) await ch.track(me.current);
      });
    })();
    return () => {
      off = true;
      if (chan.current) void supabase.removeChannel(chan.current);
      chan.current = null;
    };
  }, [supabase, channel]);

  // la page ouverte change : on met à jour l'infobulle des autres
  useEffect(() => {
    pathRef.current = pathname;
    if (!me.current || !chan.current) return;
    me.current = { ...me.current, page: pageLabel(pathname) };
    void chan.current.track(me.current);
  }, [pathname]);

  // photos de profil des autres (équipe) : liens temporaires ; sans droit de lecture, on garde l'initiale
  const photoKey = people.map((w) => w.photo ?? "").join("|");
  useEffect(() => {
    const paths = Array.from(new Set(people.map((w) => w.photo).filter((x): x is string => !!x)));
    if (!paths.length) return;
    let off = false;
    supabase.storage.from("avatars").createSignedUrls(paths, 3600).then(({ data }) => {
      if (off || !data) return;
      setPhotos(Object.fromEntries(data.filter((d) => d.signedUrl && d.path).map((d): [string, string] => [d.path as string, d.signedUrl as string])));
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey, supabase]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!meId || people.length === 0) return null;
  const ordered = [...people.filter((w) => w.id === meId), ...people.filter((w) => w.id !== meId).sort((a, b) => a.name.localeCompare(b.name))];
  const shown = ordered.slice(0, max);
  const rest = ordered.slice(max);

  const tip = (w: Who) => (
    <span className="pointer-events-none absolute top-[calc(100%+8px)] right-1/2 z-50 translate-x-1/2 rounded-lg bg-[var(--navy-deep)] px-2.5 py-1.5 text-[12px] leading-tight font-semibold whitespace-nowrap text-[var(--panel-fg)] opacity-0 transition-opacity group-hover:opacity-100">
      {w.id === meId ? `Toi — ${w.name}` : w.name}
      {channel === "team" && (
        <span className="block text-[10.5px] font-normal opacity-75">
          {ROLE_LABEL[w.role] ?? ""}{w.page ? ` · sur ${w.page}` : ""}
        </span>
      )}
    </span>
  );
  const dot = (w: Who) => {
    const url = w.photo ? photos[w.photo] : null;
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-full w-full rounded-full object-cover" />
    ) : (
      <span className="flex h-full w-full items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: colorOf(w.id) }}>{initial(w.name)}</span>
    );
  };

  return (
    <div ref={box} className={`flex items-center ${className}`} aria-label="Personnes connectées en ce moment">
      {shown.map((w, i) => (
        <span key={w.id} tabIndex={0} aria-label={w.id === meId ? `Toi, ${w.name}` : w.name} className={`group relative h-[34px] w-[34px] flex-none rounded-full border-2 border-[var(--card)] ${i ? "-ml-2" : ""} hover:z-10 focus:z-10`}>
          {dot(w)}
          <span className="absolute -right-0.5 -bottom-0.5 h-[10px] w-[10px] rounded-full border-2 border-[var(--card)] bg-[var(--good)]" />
          {tip(w)}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="relative -ml-2">
          <button type="button" aria-expanded={open} aria-label={`${rest.length} autres personnes connectées`} onClick={() => setOpen((v) => !v)} className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-[var(--card)] bg-[var(--track)] text-[12px] font-bold text-[var(--slate)]">
            +{rest.length}
          </button>
          {open && (
            <span className="absolute top-[calc(100%+8px)] right-0 z-50 block w-[250px] rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-[var(--shadow)]">
              <span className="block px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Aussi connectés</span>
              {rest.map((w) => (
                <span key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--navy)]">
                  <span className="h-[22px] w-[22px] flex-none">{dot(w)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
                  {channel === "team" && <span className="flex-none text-[11px] text-[var(--slate)]">{ROLE_LABEL[w.role] ?? ""}</span>}
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
