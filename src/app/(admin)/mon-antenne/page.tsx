"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_DEPOT, useCity } from "@/components/admin/CityContext";
import AddressSearch from "@/components/AddressSearch";
import CreneauxEditor from "@/components/CreneauxEditor";
import { formatCreneaux, hasAnyCreneau, type Creneaux } from "@/lib/creneaux";

// La fiche d'identité de l'antenne : les infos « en dur » qui structurent les tournées (adresses, contact, jours et heures de tournée).
// Le Responsable d'antenne modifie celle de SA ville, le Superadmin celle de n'importe quelle ville ; la Comptabilité consulte.
// L'écriture passe par la fonction update_city_identity (migration 084), qui ne touche qu'à ces champs.

type Form = { depot: string; stock: string; office: string; phone: string; email: string; slots: Creneaux };
const EMPTY: Form = { depot: "", stock: "", office: "", phone: "", email: "", slots: {} };

const card = "rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]";
const labelCls = "mb-1.5 block text-[11.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";
const fieldCls =
  "w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)] disabled:opacity-70";

function Address({ value, onChange, disabled, placeholder }: { value: string; onChange: (v: string) => void; disabled: boolean; placeholder?: string }) {
  if (disabled) return <div className={`${fieldCls} min-h-[42px]`}>{value || <span className="text-[var(--muted)]">Non renseignée</span>}</div>;
  return <AddressSearch className={fieldCls} value={value} onChange={onChange} onPick={(hit) => onChange(hit.label)} placeholder={placeholder ?? "Rue, code postal, ville"} />;
}

function Fiche({ cityId }: { cityId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { role, city, reloadCities } = useCity();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canEdit = role === "admin_principal" || role === "admin_local";

  useEffect(() => {
    let off = false;
    supabase
      .from("cities")
      .select("depot_address,stock_address,office_address,phone,contact_email,tour_slots")
      .eq("id", cityId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (off) return;
        if (error) {
          setMsg({ ok: false, text: "Lecture impossible : " + error.message + " (la migration 084 est-elle passée ?)" });
          setLoading(false);
          return;
        }
        const d = (data ?? {}) as Record<string, unknown>;
        const f: Form = {
          depot: (d.depot_address as string) || (city?.name === "Lyon" ? DEFAULT_DEPOT : ""),
          stock: (d.stock_address as string) || "",
          office: (d.office_address as string) || "",
          phone: (d.phone as string) || "",
          email: (d.contact_email as string) || "",
          slots: (d.tour_slots as Creneaux) || {},
        };
        setForm(f);
        setSaved(f);
        setLoading(false);
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, supabase]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setMsg(null);
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg({ ok: false, text: "L'adresse e-mail n'est pas valide." });
    // crénaux incohérents (fin avant début) : on prévient plutôt que d'enregistrer
    for (const [day, list] of Object.entries(form.slots)) {
      for (const s of list) if (s.close <= s.open) return setMsg({ ok: false, text: `Créneau du ${day} : l'heure de fin doit être après l'heure de début.` });
    }
    setBusy(true);
    const { error } = await supabase.rpc("update_city_identity", {
      p_city: cityId, p_depot: form.depot, p_stock: form.stock, p_office: form.office, p_phone: form.phone, p_email: email, p_slots: form.slots,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Enregistrement impossible : " + error.message });
    setSaved({ ...form, email });
    setForm((f) => ({ ...f, email }));
    setMsg({ ok: true, text: "La fiche de l'antenne est enregistrée." });
    void reloadCities(); // le Planning et « Ma journée » relisent aussitôt les nouvelles adresses
  }

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-4 w-4 flex-none rounded-full" style={{ background: city?.color }} />
        <h1 className="font-display text-[28px] font-black text-[var(--navy)]">Mon antenne · {city?.name}</h1>
      </div>
      <p className="mt-1 mb-5 text-[13.5px] text-[var(--slate)]">
        La fiche d&apos;identité de l&apos;antenne : les informations structurantes qui servent au Planning et à « Ma journée ».
        {!canEdit && " Tu peux les consulter ; seuls le Superadmin et le Responsable d'antenne les modifient."}
      </p>

      {loading ? (
        <div className={`${card} text-[13px] text-[var(--slate)]`}>Chargement…</div>
      ) : (
        <div className="flex flex-col gap-4">
          <section className={card}>
            <h2 className="mb-3 font-display text-[17px] font-extrabold text-[var(--navy)]">Adresses</h2>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className={labelCls}>Entrepôt · départ des tournées</label>
                <Address value={form.depot} onChange={(v) => set({ depot: v })} disabled={!canEdit} />
                <p className="mt-1 text-[11.5px] text-[var(--muted)]">C&apos;est le point de départ et de retour des tournées dans le Planning. Pour un camion loué, indique l&apos;adresse du loueur.</p>
              </div>
              <div>
                <label className={labelCls}>Stock (si différent de l&apos;entrepôt)</label>
                <Address value={form.stock} onChange={(v) => set({ stock: v })} disabled={!canEdit} />
                <p className="mt-1 text-[11.5px] text-[var(--muted)]">Utilisée par les arrêts « Prise au stock » et « Dépose au stock ». Vide = l&apos;adresse de l&apos;entrepôt.</p>
              </div>
              <div>
                <label className={labelCls}>Bureaux</label>
                <Address value={form.office} onChange={(v) => set({ office: v })} disabled={!canEdit} />
              </div>
            </div>
          </section>

          <section className={card}>
            <h2 className="mb-3 font-display text-[17px] font-extrabold text-[var(--navy)]">Contact de l&apos;antenne</h2>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Téléphone</label>
                <input type="tel" className={fieldCls} value={form.phone} disabled={!canEdit} onChange={(e) => set({ phone: e.target.value })} placeholder="06 12 34 56 78" maxLength={30} />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input type="email" className={fieldCls} value={form.email} disabled={!canEdit} onChange={(e) => set({ email: e.target.value })} placeholder="antenne@linkee.co" maxLength={120} />
              </div>
            </div>
          </section>

          <section className={card}>
            <h2 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Jours et heures de tournée</h2>
            <p className="mb-3 text-[12.5px] text-[var(--slate)]">
              Quand l&apos;antenne fait ses tournées. Plusieurs plages par jour sont possibles, et une semaine sur deux si besoin.
              {!hasAnyCreneau(form.slots) && " Aucun créneau n'est renseigné pour l'instant."}
            </p>
            {!canEdit && hasAnyCreneau(form.slots) ? (
              <p className="rounded-xl bg-[var(--input-bg)] px-3.5 py-3 text-[13px] text-[var(--navy)]">{formatCreneaux(form.slots)}</p>
            ) : (
              <CreneauxEditor value={form.slots} onChange={(v) => set({ slots: v })} disabled={!canEdit} emptyLabel="Pas de tournée" />
            )}
          </section>

          {msg && (
            <div className={`rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ${msg.ok ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--critical-bg)] text-[var(--critical)]"}`}>{msg.text}</div>
          )}
          {canEdit && (
            <div className="sticky bottom-3 flex items-center gap-3">
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={() => void save()}
                className="rounded-[40px] bg-[var(--navy-deep)] px-6 py-3 font-display text-[14.5px] font-bold text-[var(--panel-fg)] shadow-[var(--shadow)] disabled:opacity-50"
              >
                {busy ? "Enregistrement…" : "Enregistrer la fiche"}
              </button>
              {dirty && <span className="rounded-[40px] bg-[var(--warn-bg)] px-3 py-1 text-[12px] font-bold text-[var(--warn)]">Modifications non enregistrées</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MonAntennePage() {
  const { ready, cityId, isAll } = useCity();
  if (!ready) return null;
  if (isAll || !cityId)
    return (
      <div className="mx-auto max-w-[760px]">
        <h1 className="font-display text-[28px] font-black text-[var(--navy)]">Mon antenne</h1>
        <div className={`${card} mt-4 text-[14px] text-[var(--slate)]`}>Choisis une ville dans la barre du haut pour voir ou modifier sa fiche d&apos;antenne.</div>
      </div>
    );
  return <Fiche key={cityId} cityId={cityId} />; // une fiche par ville : le formulaire repart à zéro quand on change de ville
}
