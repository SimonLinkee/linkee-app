"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { compressImage } from "@/lib/photos";
import { BOARD_SLOTS, initialsOf, tintFor, useOrganigramme, type BoardMember, type CityLite, type LinkerLite, type TeamMember, type TeamVehicle } from "@/lib/organigramme";

const stamp = () => Date.now();
const label = "mb-2 text-[11.5px] font-bold tracking-[0.05em] text-[var(--slate)] uppercase";
const card = "rounded-[16px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]";

function Avatar({ url, name, size }: { url?: string; name: string | null; size: number }) {
  const [bg, fg] = tintFor(name ?? "?");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="flex-none rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex flex-none items-center justify-center rounded-full font-display font-bold" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.34 }}>{initialsOf(name)}</span>
  );
}

const ROLE_BADGE: Record<string, { text: string; bg: string; fg: string }> = {
  admin_local: { text: "Responsable d'antenne", bg: "var(--bg-accent)", fg: "var(--text-accent)" },
  resp_distribution: { text: "Resp. distribution", bg: "var(--bg-accent)", fg: "var(--text-accent)" },
  logisticien: { text: "Logisticien", bg: "var(--warn-bg)", fg: "var(--warn)" },
  resp_rh: { text: "Responsable RH", bg: "var(--bg-accent)", fg: "var(--text-accent)" },
  admin_principal: { text: "Superadmin", bg: "var(--track)", fg: "var(--slate)" },
  comptabilite: { text: "Comptabilité", bg: "var(--track)", fg: "var(--slate)" },
};

function PersonCard({ m, url }: { m: TeamMember; url?: string }) {
  const b = ROLE_BADGE[m.role];
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-3 text-center">
      <div className="mb-2 flex justify-center"><Avatar url={url} name={m.full_name} size={64} /></div>
      <p className="text-[14.5px] font-bold text-[var(--navy)]">{m.full_name || "Sans nom"}</p>
      {b && <span className="my-1 inline-block rounded-[40px] px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: b.bg, color: b.fg }}>{b.text}</span>}
      {m.phone && <p className="text-[12px]"><a href={`tel:${m.phone}`} className="text-[var(--slate)] hover:text-[var(--turquoise)]">{m.phone}</a></p>}
      {m.email && <p className="truncate text-[12px]"><a href={`mailto:${m.email}`} className="text-[var(--slate)] hover:text-[var(--turquoise)]">{m.email}</a></p>}
    </div>
  );
}

function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-center">
      <div className="mb-2 flex justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--border)] text-[var(--muted)]">?</span></div>
      <p className="text-[13.5px] font-semibold text-[var(--muted)]">À renseigner</p>
      <span className="my-1 inline-block rounded-[40px] bg-[var(--bg-accent)] px-2.5 py-0.5 text-[10.5px] font-bold text-[var(--text-accent)]">{title}</span>
      {note && <p className="text-[11px] text-[var(--muted)]">{note}</p>}
    </div>
  );
}

/** Comité d'administration : 7 places (photo + nom). Le Superadmin les modifie ici ; les autres les consultent. */
function Board({ board, urls, canEdit, onChanged }: { board: BoardMember[]; urls: Record<string, string>; canEdit: boolean; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, { name: string; file: File | null }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const bySlot = new Map(board.map((b) => [b.slot, b]));

  async function save(slot: number) {
    const cur = bySlot.get(slot);
    const d = drafts[slot] ?? { name: cur?.name ?? "", file: null };
    if (!d.name.trim()) return setErr("Indique un nom.");
    setBusy(slot);
    setErr(null);
    try {
      let photo = cur?.photo_path ?? null;
      if (d.file) {
        if (!d.file.type.startsWith("image/")) throw new Error("Choisis une image.");
        const blob = await compressImage(d.file, 512, 0.85);
        const path = `slot-${slot}-${stamp()}.jpg`;
        const up = await supabase.storage.from("board").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error(up.error.message + " (la migration 050 est-elle passée ?)");
        photo = path;
      }
      const { error } = await supabase.from("board_members").upsert({ slot, name: d.name.trim(), photo_path: photo, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      if (d.file && cur?.photo_path) await supabase.storage.from("board").remove([cur.photo_path]);
      setDrafts((p) => {
        const n = { ...p };
        delete n[slot];
        return n;
      });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  }
  async function remove(slot: number) {
    const cur = bySlot.get(slot);
    if (!cur || !window.confirm(`Retirer « ${cur.name} » du comité ?`)) return;
    setBusy(slot);
    const { error } = await supabase.from("board_members").delete().eq("slot", slot);
    if (error) setErr(error.message);
    else {
      if (cur.photo_path) await supabase.storage.from("board").remove([cur.photo_path]);
      onChanged();
    }
    setBusy(null);
  }

  const slots = Array.from({ length: BOARD_SLOTS }, (_, i) => i + 1);
  const filled = board.length;
  return (
    <div className={`${card} mb-3.5 px-4 py-3.5`}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] font-bold tracking-[0.05em] text-[var(--slate)] uppercase">Comité d&apos;administration</p>
        <span className="flex items-center gap-2">
          {filled < BOARD_SLOTS && <span className="rounded-[40px] bg-[var(--warn-bg)] px-2.5 py-0.5 text-[10.5px] font-bold text-[var(--warn)]">En cours de construction</span>}
          {canEdit && (
            <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3 py-1 text-[11.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)]">
              {editing ? "Terminer" : "Modifier"}
            </button>
          )}
        </span>
      </div>
      {err && <p className="mb-2 rounded-lg bg-[var(--critical-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--critical)]">{err}</p>}
      {!editing ? (
        <div className="flex flex-wrap justify-center gap-3.5">
          {slots.map((s) => {
            const b = bySlot.get(s);
            return b ? (
              <div key={s} className="w-[76px] text-center"><div className="mb-1 flex justify-center"><Avatar url={b.photo_path ? urls[b.photo_path] : undefined} name={b.name} size={52} /></div><p className="text-[11.5px] leading-tight font-semibold text-[var(--navy)]">{b.name}</p></div>
            ) : (
              <div key={s} className="w-[76px] text-center"><div className="mb-1 flex justify-center"><span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--border)] text-[var(--muted)]">·</span></div></div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {slots.map((s) => {
            const cur = bySlot.get(s);
            const d = drafts[s] ?? { name: cur?.name ?? "", file: null };
            return (
              <div key={s} className="rounded-[12px] border border-[var(--border)] bg-[var(--input-bg)] p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar url={d.file ? URL.createObjectURL(d.file) : cur?.photo_path ? urls[cur.photo_path] : undefined} name={d.name || null} size={40} />
                  <label className="cursor-pointer rounded-[40px] border-[1.5px] border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--navy)]">
                    Photo
                    <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; if (f) setDrafts((p) => ({ ...p, [s]: { name: d.name, file: f } })); }} />
                  </label>
                </div>
                <input value={d.name} placeholder={`Membre ${s}`} onChange={(e) => setDrafts((p) => ({ ...p, [s]: { name: e.target.value, file: d.file } }))} className="mb-2 w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]" />
                <div className="flex gap-1.5">
                  <button type="button" disabled={busy === s || !d.name.trim()} onClick={() => save(s)} className="flex-1 rounded-[40px] bg-[var(--navy-deep)] py-1.5 text-[11.5px] font-bold text-[var(--panel-fg)] disabled:opacity-50">{busy === s ? "…" : "Enregistrer"}</button>
                  {cur && <button type="button" disabled={busy === s} onClick={() => remove(s)} className="rounded-[40px] border-[1.5px] border-[var(--critical)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--critical)]">Retirer</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CitySection({ city, team, vehicles, linkers, urls, mobile }: { city: CityLite; team: TeamMember[]; vehicles: TeamVehicle[]; linkers: LinkerLite[]; urls: Record<string, string>; mobile: boolean }) {
  const [allLinkers, setAllLinkers] = useState(false);
  const of = (role: string) => team.filter((m) => m.city_id === city.id && m.role === role);
  const antennes = of("admin_local");
  const distribs = of("resp_distribution");
  const logs = of("logisticien");
  const vs = vehicles.filter((v) => v.city_id === city.id);
  const ls = linkers.filter((l) => l.city_id === city.id);
  const shownL = allLinkers ? ls : ls.slice(0, 12);
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-4 py-2 font-display text-[15px] font-extrabold text-white" style={{ background: city.color || "var(--navy-deep)" }}>{city.name}</div>
      <div className="px-3.5 py-3.5">
        <p className={label}>Responsable d&apos;antenne</p>
        <div className="mb-4 grid grid-cols-1 gap-2.5">
          {antennes.length ? antennes.map((m) => <PersonCard key={m.id} m={m} url={m.photo_path ? urls[m.photo_path] : undefined} />) : <Placeholder title="Responsable d'antenne" />}
        </div>
        {distribs.length > 0 && (
          <>
            <p className={label}>Responsable distribution</p>
            <div className="mb-4 grid grid-cols-1 gap-2.5">{distribs.map((m) => <PersonCard key={m.id} m={m} url={m.photo_path ? urls[m.photo_path] : undefined} />)}</div>
          </>
        )}
        <p className={label}>Logisticiens</p>
        {logs.length ? <div className={`mb-4 grid gap-2.5 ${mobile ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>{logs.map((m) => <PersonCard key={m.id} m={m} url={m.photo_path ? urls[m.photo_path] : undefined} />)}</div> : <p className="mb-4 text-[12.5px] text-[var(--muted)]">Aucun compte pour l&apos;instant.</p>}
        <p className={label}>Véhicules disponibles</p>
        {vs.length ? (
          <div className="mb-4 overflow-hidden rounded-[12px] border border-[var(--border)]">
            {vs.map((v, i) => (
              <div key={v.id} className={`flex items-center gap-2.5 px-3 py-2 text-[12.5px] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
                <span className="min-w-0 flex-1 truncate font-bold text-[var(--navy)]">{v.name}</span>
                <span className="flex-none text-[11.5px] text-[var(--slate)]">{v.plate}</span>
                <span className="flex-none text-[11.5px] text-[var(--slate)]">{v.assigned_name ?? "Non affecté"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-[12.5px] text-[var(--muted)]">Aucun véhicule en service.</p>
        )}
        {linkers.length > 0 || ls.length > 0 ? (
          <>
            <p className={label}>Linkers ({ls.length})</p>
            <p className="mb-1.5 text-[10.5px] text-[var(--muted)]">Prénom et photo seulement.</p>
            <div className="flex flex-wrap gap-1.5">
              {shownL.map((l) => (
                <span key={l.id} className="flex items-center gap-1.5 rounded-[40px] bg-[var(--input-bg)] py-1 pr-3 pl-1 text-[12px] font-semibold text-[var(--navy)]">
                  <Avatar url={l.photo_path ? urls[l.photo_path] : undefined} name={l.first_name} size={26} />
                  {l.first_name}
                </span>
              ))}
              {ls.length > 12 && (
                <button type="button" onClick={() => setAllLinkers((v) => !v)} className="px-2 text-[12px] font-bold text-[var(--turquoise)]">{allLinkers ? "Réduire" : `+ ${ls.length - 12} autres`}</button>
              )}
              {ls.length === 0 && <span className="text-[12px] text-[var(--muted)]">Aucun Linker pour l&apos;instant.</span>}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** PC : toutes les antennes sur une même ligne, qui défile à l'horizontale avec des flèches quand elles sont trop nombreuses
 * pour tenir à l'écran (Bordeaux, Lille, Nantes…). Tant qu'elles tiennent, elles se partagent la largeur et les flèches
 * disparaissent. */
function CityScroller({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update); // se déclenche aussi une première fois à l'observation
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [count]);

  function go(dir: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const step = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 320;
    el.scrollBy({ left: dir * (step + 14), behavior: "smooth" });
  }
  const arrow = "absolute z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--navy)] shadow-[var(--shadow)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]";
  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11.5px] font-bold tracking-[0.05em] text-[var(--slate)] uppercase">Antennes ({count})</p>
        {(edge.left || edge.right) && <p className="text-[11.5px] text-[var(--muted)]">Fais défiler pour voir les autres antennes</p>}
      </div>
      {edge.left && (
        <button type="button" onClick={() => go(-1)} aria-label="Antennes précédentes" className={`${arrow} -left-4 top-[calc(50%-20px)]`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d="M15 5 L8 12 L15 19" /></svg>
        </button>
      )}
      {edge.right && (
        <button type="button" onClick={() => go(1)} aria-label="Antennes suivantes" className={`${arrow} -right-4 top-[calc(50%-20px)]`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d="M9 5 L16 12 L9 19" /></svg>
        </button>
      )}
      <div ref={ref} className="flex snap-x snap-mandatory items-start gap-3.5 overflow-x-auto pb-3 [scrollbar-width:thin]">{children}</div>
    </div>
  );
}

/** Organigramme : comité d'administration, équipe nationale, puis une section par antenne (équipe, véhicules en service,
 * Linkers). PC : toutes les antennes côte à côte. Mobile : un sélecteur de ville. */
export default function OrganigrammeView({ mobile = false }: { mobile?: boolean }) {
  const { role } = useCity();
  const { data, urls, boardUrls, error, reload } = useOrganigramme();
  const [pick, setPick] = useState("");
  if (!data) return <p className="py-10 text-center text-[13px] text-[var(--slate)]">Chargement…</p>;

  const national = (r: string) => data.team.filter((m) => m.role === r);
  const rh = national("resp_rh");
  const admins = [...national("admin_principal"), ...national("comptabilite")];
  const cities = data.cities;
  const cityId = pick || cities[0]?.id || "";
  const shown = mobile ? cities.filter((c) => c.id === cityId) : cities;

  return (
    <div>
      {error && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{error}</div>}

      <Board board={data.board} urls={boardUrls} canEdit={role === "admin_principal"} onChanged={reload} />

      <div className={`${card} mb-4 px-4 py-3.5`}>
        <p className={label}>Équipe nationale</p>
        <div className={`grid gap-2.5 ${mobile ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(200px,1fr))]"}`}>
          {rh.length ? rh.map((m) => <PersonCard key={m.id} m={m} url={m.photo_path ? urls[m.photo_path] : undefined} />) : <Placeholder title="Responsable RH" />}
          <Placeholder title="Resp. distribution et bénévolat" note="national" />
          <Placeholder title="Responsable opérations" note="national" />
        </div>
        {admins.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2.5">
            {admins.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 rounded-[12px] bg-[var(--input-bg)] px-3 py-2">
                <Avatar url={m.photo_path ? urls[m.photo_path] : undefined} name={m.full_name} size={34} />
                <div><p className="text-[12.5px] font-bold text-[var(--navy)]">{m.full_name || "Sans nom"}</p><p className="text-[11px] text-[var(--slate)]">{ROLE_BADGE[m.role]?.text}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mobile && cities.length > 0 && (
        <select value={cityId} onChange={(e) => setPick(e.target.value)} aria-label="Ville" className="mb-3 h-11 w-full rounded-full border-0 px-4 text-[14px] font-bold text-white" style={{ background: cities.find((c) => c.id === cityId)?.color ?? "var(--slate)" }}>
          {cities.map((c) => <option key={c.id} value={c.id} className="text-[#111]">{c.name}</option>)}
        </select>
      )}

      {mobile ? (
        <div className="flex flex-col gap-3.5">
          {shown.map((c) => (
            <CitySection key={c.id} city={c} team={data.team} vehicles={data.vehicles} linkers={data.linkers} urls={urls} mobile />
          ))}
        </div>
      ) : (
        <CityScroller count={cities.length}>
          {shown.map((c) => (
            <div key={c.id} className="flex-[1_0_300px] snap-start">
              <CitySection city={c} team={data.team} vehicles={data.vehicles} linkers={data.linkers} urls={urls} mobile={false} />
            </div>
          ))}
        </CityScroller>
      )}
    </div>
  );
}
