"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";

type Kind = "partner" | "beneficiaire";
type Contact = { type: string; nom: string; tel: string; mail: string };
type Row = { id: string; name: string; category: string | null; address: string | null; active: boolean; fiche: Record<string, unknown> | null };

const DENREES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const PARTNER_CATS = ["Boulangerie", "Supermarché", "Traiteur", "Hôtel", "Restauration rapide", "Restauration collective", "Industriel", "Grossiste"];
const BENEF_CATS = ["Distribution Linkee", "Association partenaire"];
const CONTACT_TYPES = ["Sur site", "Administratif", "Financier"];
const field = "h-[52px] w-full rounded-2xl border-2 border-[var(--border)] bg-[var(--input-bg)] px-4 text-[16px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const label = "mb-1.5 block text-[13px] font-bold text-[var(--navy)]";
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Superadmin mobile: consult and edit the fiches (no creation, no deletion). */
export default function MobileFiches() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId } = useCity();
  const [kind, setKind] = useState<Kind>("partner");
  const [rows, setRows] = useState<Record<Kind, Row[]>>({ partner: [], beneficiaire: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!cityId) return;
    (async () => {
      const cols = "id,name,category,address,active,fiche";
      const [p, b] = await Promise.all([supabase.from("partners").select(cols).eq("city_id", cityId).order("name"), supabase.from("beneficiaries").select(cols).eq("city_id", cityId).order("name")]);
      if (p.error || b.error) setErr((p.error ?? b.error)!.message);
      setRows({ partner: (p.data ?? []) as Row[], beneficiaire: (b.data ?? []) as Row[] });
      setLoading(false);
    })();
  }, [supabase, cityId]);

  const table = kind === "partner" ? "partners" : "beneficiaries";
  const list = rows[kind].filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  const cur = rows[kind].find((r) => r.id === openId) ?? null;

  /** Merge changes into the row and save it (debounced). Unknown fiche keys are kept as they are. */
  function patch(id: string, p: Partial<Pick<Row, "name" | "category" | "address" | "active">>, fiche: Record<string, unknown> = {}) {
    setRows((prev) => {
      const next = prev[kind].map((r) => {
        if (r.id !== id) return r;
        const f = { ...(r.fiche ?? {}), ...fiche };
        const category = p.category ?? r.category;
        if (kind === "beneficiaire" && p.category !== undefined) f.pinned = category === "Distribution Linkee";
        return { ...r, ...p, fiche: f };
      });
      return { ...prev, [kind]: next };
    });
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(async () => {
      const r = latest.current[kind].find((x) => x.id === id);
      if (!r) return;
      const { error } = await supabase.from(table).update({ name: r.name, category: r.category, address: r.address, active: r.active, fiche: r.fiche }).eq("id", id);
      if (error) return setErr("Enregistrement impossible : " + error.message);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    }, 700);
  }
  const latest = useRef(rows);
  latest.current = rows;

  if (cur) {
    const f = (cur.fiche ?? {}) as Record<string, unknown>;
    const setF = (k: string, v: unknown) => patch(cur.id, {}, { [k]: v });
    const denrees = (f.denrees as Record<string, boolean>) ?? {};
    const contacts = (f.contacts as Contact[]) ?? [];
    const setContacts = (c: Contact[]) => setF("contacts", c);
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => setOpenId(null)} className="flex h-11 w-fit items-center gap-1.5 rounded-full border-2 border-[var(--border)] px-4 text-[14px] font-bold text-[var(--navy)]">← Liste</button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[26px] leading-tight font-black text-[var(--navy)]">{cur.name || "Sans nom"}</h1>
          <span className={`flex-none text-[12px] font-bold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Enregistré ✓</span>
        </div>
        {err && <div className="rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--critical)]">{err}</div>}

        <section className="flex flex-col gap-3.5 rounded-[20px] border-2 border-[var(--border)] bg-[var(--card)] p-4">
          <div>
            <span className={label}>Nom</span>
            <input className={field} value={cur.name} onChange={(e) => patch(cur.id, { name: e.target.value })} />
          </div>
          <div>
            <span className={label}>Catégorie</span>
            <select className={field} value={cur.category ?? ""} onChange={(e) => patch(cur.id, { category: e.target.value })}>
              {Array.from(new Set([...(kind === "partner" ? PARTNER_CATS : BENEF_CATS), cur.category ?? ""])).filter(Boolean).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Adresse</span>
            <input className={field} value={cur.address ?? ""} onChange={(e) => patch(cur.id, { address: e.target.value })} />
          </div>
          <button type="button" onClick={() => patch(cur.id, { active: !cur.active })} className={`flex h-[54px] items-center justify-between rounded-2xl px-4 text-[15px] font-bold ${cur.active ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--track)] text-[var(--slate)]"}`}>
            <span>{cur.active ? "Actif — visible dans les tournées" : "Inactif — masqué des tournées"}</span>
            <span className="text-[20px]">{cur.active ? "✓" : "○"}</span>
          </button>
        </section>

        <section className="flex flex-col gap-3.5 rounded-[20px] border-2 border-[var(--border)] bg-[var(--card)] p-4">
          {kind === "partner" ? (
            <>
              <div>
                <span className={label}>Créneau habituel</span>
                <input className={field} value={str(f.creneau)} onChange={(e) => setF("creneau", e.target.value)} placeholder="Ex : lundi 10h-12h" />
              </div>
              <div>
                <span className={label}>Antenne / site</span>
                <input className={field} value={str(f.antenne)} onChange={(e) => setF("antenne", e.target.value)} />
              </div>
              <div>
                <span className={label}>Durée de collecte (min)</span>
                <input className={field} type="number" inputMode="numeric" value={str(f.dureeCollecte)} onChange={(e) => setF("dureeCollecte", parseInt(e.target.value, 10) || 0)} />
              </div>
            </>
          ) : (
            <>
              <div>
                <span className={label}>Téléphone</span>
                <input className={field} type="tel" value={str(f.tel)} onChange={(e) => setF("tel", e.target.value)} />
              </div>
              <div>
                <span className={label}>E-mail</span>
                <input className={field} type="email" value={str(f.mail)} onChange={(e) => setF("mail", e.target.value)} />
              </div>
              <div>
                <span className={label}>Horaires</span>
                <input className={field} value={str(f.horaires)} onChange={(e) => setF("horaires", e.target.value)} placeholder="Ex : Lun-Ven 9h-17h" />
              </div>
              <div>
                <span className={label}>Volumes acceptés</span>
                <input className={field} value={str(f.volumesAcceptes)} onChange={(e) => setF("volumesAcceptes", e.target.value)} />
              </div>
            </>
          )}
          <div>
            <span className={label}>{kind === "partner" ? "Denrées données" : "Denrées acceptées"}</span>
            <div className="flex flex-wrap gap-2">
              {DENREES.map((d) => {
                const on = !!denrees[d];
                return (
                  <button key={d} type="button" onClick={() => setF("denrees", { ...denrees, [d]: !on })} className={`min-h-[46px] rounded-full border-2 px-4 text-[14px] font-bold ${on ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] text-[var(--slate)]"}`}>
                    {on ? "✓ " : ""}{d}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className={label}>Accès / consignes</span>
            <textarea className={`${field} min-h-[92px] py-3`} value={str(f.accessNote)} onChange={(e) => setF("accessNote", e.target.value)} placeholder="Digicode, quai, étage…" />
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-[20px] border-2 border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="font-display text-[19px] font-extrabold text-[var(--navy)]">Contacts</h2>
          {contacts.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucun contact.</p>}
          {contacts.map((c, i) => {
            const set = (k: keyof Contact, v: string) => setContacts(contacts.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
            return (
              <div key={i} className="flex flex-col gap-2 rounded-2xl bg-[var(--input-bg)] p-3">
                <select className={field} value={c.type} onChange={(e) => set("type", e.target.value)}>
                  {Array.from(new Set([...CONTACT_TYPES, c.type])).map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className={field} value={c.nom} placeholder="Nom" onChange={(e) => set("nom", e.target.value)} />
                <input className={field} type="tel" value={c.tel} placeholder="Téléphone" onChange={(e) => set("tel", e.target.value)} />
                <input className={field} type="email" value={c.mail} placeholder="E-mail" onChange={(e) => set("mail", e.target.value)} />
                <button type="button" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} className="h-11 text-[13px] font-bold text-[var(--critical)]">Retirer ce contact</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setContacts([...contacts, { type: "Sur site", nom: "", tel: "", mail: "" }])} className="h-[52px] rounded-2xl border-2 border-dashed border-[var(--turquoise)] text-[15px] font-bold text-[var(--navy)]">+ Ajouter un contact</button>
        </section>
        <p className="text-center text-[12px] text-[var(--slate)]">Les autres réglages de la fiche (checklist de passage, horaires détaillés, accès espace partenaire…) sont sur la version PC.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] leading-tight font-black text-[var(--navy)]">Fiches</h1>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--card)] p-1.5 shadow-[var(--shadow)]">
        {(
          [
            ["partner", "Partenaires", "#0a1a3f", "#fdf4ed"],
            ["beneficiaire", "Bénéficiaires", "#1a8f68", "#fdf4ed"],
          ] as [Kind, string, string, string][]
        ).map(([k, l, bg, fg]) => (
          <button key={k} type="button" onClick={() => { setKind(k); setSearch(""); }} className="h-[54px] rounded-xl font-display text-[18px] font-extrabold" style={kind === k ? { background: bg, color: fg } : { color: "var(--slate)" }}>
            {l}
          </button>
        ))}
      </div>
      <input className={field} placeholder="Rechercher un nom…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading && <p className="py-6 text-center text-[14px] text-[var(--slate)]">Chargement…</p>}
      {!loading && list.length === 0 && <p className="py-6 text-center text-[14px] text-[var(--slate)]">Aucune fiche.</p>}
      <div className="flex flex-col gap-2.5">
        {list.map((r) => (
          <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="flex min-h-[68px] items-center gap-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left active:bg-[var(--track)]">
            <span className={`h-3 w-3 flex-none rounded-full ${r.active ? "bg-[var(--good)]" : "bg-[var(--muted)]"}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-bold text-[var(--navy)]">{r.name}</span>
              <span className="block truncate text-[13px] text-[var(--slate)]">{r.category}{r.address ? ` · ${r.address}` : ""}</span>
            </span>
            <span className="text-[20px] text-[var(--slate)]">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
