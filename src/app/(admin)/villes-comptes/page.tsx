"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CITY_PALETTE, DEFAULT_DEPOT, useCity } from "@/components/admin/CityContext";
import AddressSearch from "@/components/AddressSearch";

/** Adresse de l'entrepôt d'une ville : recherche BAN, enregistrée dès qu'une suggestion est choisie, ou au blur en repli. */
function DepotAddressField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <AddressSearch
      className="w-full rounded-[9px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
      value={v}
      onChange={setV}
      onPick={(hit) => { setV(hit.label); onSave(hit.label); }}
      onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); }}
      placeholder="Rue, code postal, ville"
    />
  );
}

type Role = "en_attente" | "admin_principal" | "admin_local" | "resp_distribution" | "logisticien" | "partenaire" | "beneficiaire" | "linker";
type City = { id: string; name: string; color?: string | null; depot_address?: string | null };
type PartnerLite = { id: string; name: string; city_id: string };
type BeneficiaryLite = { id: string; name: string; city_id: string };
type Account = { id: string; name: string; email: string; role: Role; city: string | null; active: boolean; partnerIds: string[]; beneficiaryIds: string[] };
type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  city_id: string | null;
  active?: boolean;
  partner_users: { partner_id: string }[] | null;
};

const ROLE_LABELS: Record<Role, string> = {
  admin_principal: "Superadmin",
  admin_local: "Responsable d'antenne",
  resp_distribution: "Resp. Distribution",
  logisticien: "Logisticien",
  partenaire: "Partenaire",
  beneficiaire: "Bénéficiaire",
  linker: "Linker (bénévole)",
  en_attente: "En attente",
};
const ROLE_ORDER: Role[] = ["admin_principal", "admin_local", "resp_distribution", "logisticien", "partenaire", "beneficiaire", "linker", "en_attente"];

// One colour per role, used for the badge, the filter chips and the left edge of each row.
const ROLE_COLOR: Record<Role, { solid: string; soft: string; text: string }> = {
  admin_principal: { solid: "var(--navy-deep)", soft: "var(--navy-deep)", text: "var(--panel-fg)" },
  admin_local: { solid: "var(--turquoise)", soft: "var(--turquoise)", text: "#04262e" },
  resp_distribution: { solid: "#2a78d6", soft: "rgba(42,120,214,0.16)", text: "#2a78d6" },
  logisticien: { solid: "var(--stock-accent)", soft: "var(--stock-accent-bg)", text: "var(--stock-accent)" },
  partenaire: { solid: "var(--client-req)", soft: "var(--client-req-bg)", text: "var(--client-req)" },
  beneficiaire: { solid: "var(--dropoff)", soft: "var(--dropoff-bg)", text: "var(--dropoff)" },
  linker: { solid: "#eb6834", soft: "rgba(235,104,52,0.16)", text: "#eb6834" },
  en_attente: { solid: "var(--muted)", soft: "var(--track)", text: "var(--slate)" },
};

// accent- and case-insensitive text used by the search box
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const inputCls = "w-full rounded-[7px] border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--navy)] outline-none";
const formInputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";

function randomPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export default function VillesComptesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [cities, setCities] = useState<City[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [partners, setPartners] = useState<PartnerLite[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryLite[]>([]);
  const [benefByCity, setBenefByCity] = useState<Record<string, number>>({});
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingCity, setAddingCity] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "logisticien" as Role, city_id: "", password: "", partner_ids: [] as string[], beneficiary_ids: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string; note: string } | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    setMe(auth.user?.id ?? null);
    const [c, p, b, bu] = await Promise.all([
      supabase.from("cities").select("id,name,color,depot_address").order("name").then((r) => (r.error ? supabase.from("cities").select("id,name").order("name") : r)), // before migration 011
      supabase.from("partners").select("id,name,city_id").is("deleted_at", null).order("name"),
      supabase.from("beneficiaries").select("id,name,city_id").is("deleted_at", null),
      supabase.from("beneficiary_users").select("profile_id,beneficiary_id"), // absent before migration 030 : tolerated below
    ]);
    const first = await supabase.from("profiles").select("id,email,full_name,role,city_id,active,partner_users(partner_id)").order("created_at");
    const prof: { data: unknown; error: { message: string } | null } = first.error
      ? await supabase.from("profiles").select("id,email,full_name,role,city_id,partner_users(partner_id)").order("created_at") // before migration 005
      : first;
    if (prof.error) showToast("Chargement impossible : " + prof.error.message);
    setCities((c.data ?? []) as City[]);
    setPartners((p.data ?? []) as PartnerLite[]);
    setBeneficiaries((b.data ?? []) as BeneficiaryLite[]);
    const counts: Record<string, number> = {};
    ((b.data ?? []) as { city_id: string }[]).forEach((x) => (counts[x.city_id] = (counts[x.city_id] ?? 0) + 1));
    setBenefByCity(counts);
    const benefIdsByProfile: Record<string, string[]> = {};
    if (!bu.error) (bu.data ?? []).forEach((x) => (benefIdsByProfile[x.profile_id] = [...(benefIdsByProfile[x.profile_id] ?? []), x.beneficiary_id]));
    setAccounts(
      ((prof.data ?? []) as unknown as ProfileRow[]).map((r) => ({
        id: r.id,
        name: r.full_name ?? "",
        email: r.email ?? "",
        role: r.role,
        city: r.city_id,
        active: r.active !== false,
        partnerIds: (r.partner_users ?? []).map((x) => x.partner_id),
        beneficiaryIds: benefIdsByProfile[r.id] ?? [],
      })),
    );
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [search, setSearch] = useState("");
  const partnerNames = (ids: string[]) => ids.map((id) => partners.find((p) => p.id === id)?.name).filter(Boolean) as string[];
  const beneficiaryNames = (ids: string[]) => ids.map((id) => beneficiaries.find((b) => b.id === id)?.name).filter(Boolean) as string[];
  const filtered = accounts.filter((a) => {
    if (roleFilter && a.role !== roleFilter) return false;
    const q = norm(search).trim();
    if (!q) return true;
    // every word typed must be found in at least one column (name, email, role, city, linked partners/bénéficiaires, status)
    const haystack = norm(
      [a.name, a.email, ROLE_LABELS[a.role], cities.find((c) => c.id === a.city)?.name ?? "", ...partnerNames(a.partnerIds), ...beneficiaryNames(a.beneficiaryIds), a.active ? "actif" : "inactif"].join(" "),
    );
    return q.split(/\s+/).every((w) => haystack.includes(w));
  });

  const cityName = (id: string | null) => cities.find((c) => c.id === id)?.name || "—";
  const countByCity = (cityId: string, role: Role) => accounts.filter((a) => a.city === cityId && a.role === role).length;
  const partnersInCity = (cityId: string) => partners.filter((p) => p.city_id === cityId);

  const { reloadCities } = useCity();
  const colorOf = (c: City, i: number) => c.color || CITY_PALETTE[i % CITY_PALETTE.length];
  async function updateCity(id: string, patch: { color?: string; depot_address?: string }) {
    setCities((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("cities").update(patch).eq("id", id);
    if (error) return showToast("Ville non modifiée : " + error.message + " (la migration 011 est-elle passée ?)");
    await reloadCities(); // the selector in the menu takes the new colour / depot
  }

  async function addCity() {
    const name = newCityName.trim();
    if (!name) return;
    const { error } = await supabase.from("cities").insert({ name, color: CITY_PALETTE[cities.length % CITY_PALETTE.length] });
    if (error) return showToast("Ville non créée : " + error.message);
    reloadCities();
    setAddingCity(false);
    setNewCityName("");
    showToast(`Ville « ${name} » ajoutée — reste à y rattacher des comptes et des partenaires.`);
    load();
  }

  function startEdit(a: Account) {
    setEditingId(a.id);
    setDraft({ ...a });
  }

  async function saveEdit() {
    if (!draft) return;
    const original = accounts.find((a) => a.id === draft.id);
    if (draft.id === me && (draft.role !== "admin_principal" || !draft.active)) {
      return showToast("Tu ne peux pas retirer ton propre accès administrateur principal.");
    }
    let res = await supabase.from("profiles").update({ full_name: draft.name.trim() || null, role: draft.role, city_id: draft.city, active: draft.active }).eq("id", draft.id);
    if (res.error && /active/i.test(res.error.message)) {
      res = await supabase.from("profiles").update({ full_name: draft.name.trim() || null, role: draft.role, city_id: draft.city }).eq("id", draft.id); // before migration 005
    }
    if (res.error) return showToast("Compte non mis à jour : " + res.error.message);
    // partner links (only meaningful for the "partenaire" role)
    const wanted = draft.role === "partenaire" ? draft.partnerIds : [];
    if (JSON.stringify([...wanted].sort()) !== JSON.stringify([...(original?.partnerIds ?? [])].sort())) {
      const del = await supabase.from("partner_users").delete().eq("profile_id", draft.id);
      if (del.error) return showToast("Sites non mis à jour : " + del.error.message);
      if (wanted.length) {
        const ins = await supabase.from("partner_users").insert(wanted.map((partner_id) => ({ profile_id: draft.id, partner_id })));
        if (ins.error) return showToast("Sites non mis à jour : " + ins.error.message);
      }
    }
    // beneficiary links (only meaningful for the "beneficiaire" role)
    const wantedBenef = draft.role === "beneficiaire" ? draft.beneficiaryIds : [];
    if (JSON.stringify([...wantedBenef].sort()) !== JSON.stringify([...(original?.beneficiaryIds ?? [])].sort())) {
      const del = await supabase.from("beneficiary_users").delete().eq("profile_id", draft.id);
      if (del.error) return showToast("Associations non mises à jour : " + del.error.message + " (la migration 030 est-elle passée ?)");
      if (wantedBenef.length) {
        const ins = await supabase.from("beneficiary_users").insert(wantedBenef.map((beneficiary_id) => ({ profile_id: draft.id, beneficiary_id })));
        if (ins.error) return showToast("Associations non mises à jour : " + ins.error.message);
      }
    }
    setAccounts((prev) => prev.map((a) => (a.id === draft.id ? { ...draft, partnerIds: wanted, beneficiaryIds: wantedBenef } : a)));
    setEditingId(null);
    setDraft(null);
    showToast("Compte mis à jour.");
  }

  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  async function deleteAccount() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await callApi("DELETE", { id: confirmDelete.id });
      showToast(`Compte de ${confirmDelete.name || confirmDelete.email} supprimé.`);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      showToast((e as Error).message);
      setConfirmDelete(null);
    }
    setBusy(false);
  }

  async function callApi(method: "POST" | "PATCH" | "DELETE", payload: object) {
    const res = await fetch("/api/admin/accounts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!res.ok) throw new Error(json.error ?? "Erreur inconnue");
    return json;
  }

  async function createAccount() {
    if (!form.email.trim()) return showToast("Renseigne l'adresse email.");
    if (form.password.length < 8) return showToast("Mot de passe : 8 caractères minimum (utilise « Générer »).");
    if (form.role !== "admin_principal" && !form.city_id && form.role !== "partenaire" && form.role !== "beneficiaire") return showToast("Choisis une ville pour ce compte.");
    setBusy(true);
    try {
      await callApi("POST", { ...form, city_id: form.city_id || null });
      setCredentials({ email: form.email.trim().toLowerCase(), password: form.password, note: "Compte créé." });
      setCreating(false);
      setForm({ email: "", full_name: "", role: "logisticien", city_id: cities[0]?.id ?? "", password: "", partner_ids: [], beneficiary_ids: [] });
      await load();
    } catch (e) {
      showToast((e as Error).message);
    }
    setBusy(false);
  }

  async function resetPassword(a: Account) {
    const password = randomPassword();
    setBusy(true);
    try {
      await callApi("PATCH", { id: a.id, password });
      setCredentials({ email: a.email, password, note: "Nouveau mot de passe défini." });
    } catch (e) {
      showToast((e as Error).message);
    }
    setBusy(false);
  }

  function openCreate() {
    setForm({ email: "", full_name: "", role: "logisticien", city_id: cities[0]?.id ?? "", password: randomPassword(), partner_ids: [], beneficiary_ids: [] });
    setCreating(true);
  }

  const partnerChoices = (cityId: string | null, selected: string[], onToggle: (id: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {partners.filter((p) => !cityId || p.city_id === cityId).length === 0 && <span className="text-[11.5px] text-[var(--slate)]">Aucun partenaire dans cette ville pour l&apos;instant.</span>}
      {partners
        .filter((p) => !cityId || p.city_id === cityId)
        .map((p) => (
          <label key={p.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[40px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-semibold ${selected.includes(p.id) ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"}`}>
            <input type="checkbox" className="hidden" checked={selected.includes(p.id)} onChange={() => onToggle(p.id)} />
            {p.name}
          </label>
        ))}
    </div>
  );

  const beneficiaryChoices = (cityId: string | null, selected: string[], onToggle: (id: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {beneficiaries.filter((b) => !cityId || b.city_id === cityId).length === 0 && <span className="text-[11.5px] text-[var(--slate)]">Aucun bénéficiaire dans cette ville pour l&apos;instant.</span>}
      {beneficiaries
        .filter((b) => !cityId || b.city_id === cityId)
        .map((b) => (
          <label key={b.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[40px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-semibold ${selected.includes(b.id) ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"}`}>
            <input type="checkbox" className="hidden" checked={selected.includes(b.id)} onChange={() => onToggle(b.id)} />
            {b.name}
          </label>
        ))}
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Villes &amp; comptes</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">Pilotage multi-villes de Linkee : qui a accès à quoi.</p>

      <div className="mb-[22px] flex items-center gap-2.5 rounded-[14px] bg-[var(--navy-deep)] px-4 py-[11px] text-[12.5px] font-semibold text-[var(--panel-fg)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] flex-none text-[var(--turquoise)]">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10 V7 A4 4 0 0 1 16 7 V10" />
        </svg>
        <span>
          Réservé au <strong>Superadmin</strong> — un responsable d&apos;antenne ne voit ni cet écran, ni les autres villes.
        </span>
      </div>

      {credentials && (
        <div className="mb-5 rounded-[16px] border-[1.5px] border-[var(--good)] bg-[var(--good-bg)] p-4 text-[13px] text-[var(--navy)]">
          <strong className="text-[var(--good)]">{credentials.note}</strong> Transmets ces identifiants à la personne — le mot de passe ne sera plus affiché après.
          <div className="mt-2 rounded-[10px] bg-[var(--card)] px-3.5 py-2.5 font-mono text-[13px]">
            {credentials.email} <span className="text-[var(--muted)]">/</span> <strong>{credentials.password}</strong>
          </div>
          <button type="button" onClick={() => setCredentials(null)} className="mt-2.5 rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-1.5 font-display text-[12.5px] font-bold text-[var(--slate)]">
            J&apos;ai noté, masquer
          </button>
        </div>
      )}

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="font-display text-[22px] font-black">Villes</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--slate)]">Chaque ville a ses propres partenaires, bénéficiaires, planning, stock et flotte.</p>
        </div>
        <button type="button" onClick={() => setAddingCity(true)} className="flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13px] font-bold text-[var(--panel-fg)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
          Ajouter une ville
        </button>
      </div>

      <div className="mb-[34px] grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {cities.map((c, ci) => {
          const nPartners = partnersInCity(c.id).length;
          const color = colorOf(c, ci);
          return (
            <div key={c.id} className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: `6px solid ${color}` }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-[19px] font-extrabold text-[var(--navy)]">{c.name}</span>
                <span className={`rounded-[40px] px-[9px] py-1 text-[9.5px] font-bold uppercase ${nPartners > 0 ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"}`}>{nPartners > 0 ? "Active" : "À paramétrer"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {[
                  ["Partenaires", nPartners],
                  ["Bénéficiaires", benefByCity[c.id] ?? 0],
                  ["Logisticiens", countByCity(c.id, "logisticien")],
                  ["Resp. d'antenne", countByCity(c.id, "admin_local")],
                ].map(([label, n]) => (
                  <div key={label as string} className="text-[11px] text-[var(--slate)]">
                    {label}
                    <strong className="block font-display text-[17px] font-extrabold text-[var(--navy)]">{n}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 border-t border-[var(--border)] pt-3">
                <div className="mb-1.5 text-[10.5px] font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Couleur</div>
                <div className="flex flex-wrap gap-1.5">
                  {CITY_PALETTE.map((hex) => (
                    <button key={hex} type="button" title={hex} onClick={() => updateCity(c.id, { color: hex })} className="h-6 w-6 rounded-full border-2" style={{ background: hex, borderColor: hex === color ? "var(--navy)" : "transparent" }} />
                  ))}
                </div>
                <div className="mt-2.5 mb-1 text-[10.5px] font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Adresse de l&apos;entrepôt (départ des tournées)</div>
                <DepotAddressField
                  value={c.depot_address ?? (c.name === "Lyon" ? DEFAULT_DEPOT : "")}
                  onSave={(v) => updateCity(c.id, { depot_address: v })}
                />
              </div>
            </div>
          );
        })}

        <div className="flex min-h-[150px] items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-[var(--border)] p-5">
          {addingCity ? (
            <div className="flex flex-col items-center gap-2.5">
              <input autoFocus value={newCityName} onChange={(e) => setNewCityName(e.target.value)} placeholder="Nom de la ville" className="w-40 rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-center text-sm outline-none focus:border-[var(--turquoise)]" />
              <div className="flex gap-2">
                <button type="button" onClick={addCity} className="rounded-[40px] bg-[var(--navy-deep)] px-3.5 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)]">
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingCity(false);
                    setNewCityName("");
                  }}
                  className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-2 font-display text-[13px] font-bold text-[var(--slate)]"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingCity(true)} className="flex flex-col items-center gap-1.5 text-sm font-bold text-[var(--slate)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
                <path d="M12 5 V19 M5 12 H19" />
              </svg>
              Nouvelle ville
            </button>
          )}
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="font-display text-[22px] font-black">Comptes</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--slate)]">Rôle, ville et sites de chaque personne qui se connecte : admins, logisticiens, partenaires, bénéficiaires.</p>
        </div>
        <button type="button" onClick={openCreate} className="flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13px] font-bold text-[var(--panel-fg)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
          Créer un compte
        </button>
      </div>

      {creating && (
        <div className="mb-4 rounded-[18px] border-[1.5px] border-[var(--turquoise)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h3 className="mb-3 font-display text-[16px] font-extrabold">Nouveau compte</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>Email de connexion</label>
              <input className={formInputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="prenom@exemple.fr" />
            </div>
            <div>
              <label className={labelCls}>Nom affiché</label>
              <input className={formInputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Akram" />
            </div>
            <div>
              <label className={labelCls}>Rôle</label>
              <select className={formInputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Ville</label>
              <select className={formInputCls} value={form.city_id} onChange={(e) => setForm({ ...form, city_id: e.target.value })}>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1 lg:col-span-2">
              <label className={labelCls}>Mot de passe initial (8 caractères min.)</label>
              <div className="flex gap-2">
                <input className={`${formInputCls} font-mono`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setForm({ ...form, password: randomPassword() })} className="flex-none rounded-[10px] border-[1.5px] border-[var(--border)] px-3 text-[12px] font-bold text-[var(--slate)]">
                  Générer
                </button>
              </div>
            </div>
          </div>
          {form.role === "partenaire" && (
            <div className="mt-3">
              <label className={labelCls}>Sites auxquels ce compte donne accès</label>
              {partnerChoices(form.city_id || null, form.partner_ids, (id) =>
                setForm({ ...form, partner_ids: form.partner_ids.includes(id) ? form.partner_ids.filter((x) => x !== id) : [...form.partner_ids, id] }),
              )}
            </div>
          )}
          {form.role === "beneficiaire" && (
            <div className="mt-3">
              <label className={labelCls}>Associations auxquelles ce compte donne accès</label>
              {beneficiaryChoices(form.city_id || null, form.beneficiary_ids, (id) =>
                setForm({ ...form, beneficiary_ids: form.beneficiary_ids.includes(id) ? form.beneficiary_ids.filter((x) => x !== id) : [...form.beneficiary_ids, id] }),
              )}
            </div>
          )}
          <div className="mt-4 flex gap-2.5">
            <button type="button" disabled={busy} onClick={createAccount} className="rounded-[40px] bg-[var(--navy-deep)] px-[18px] py-2.5 font-display text-[13.5px] font-bold text-[var(--panel-fg)] disabled:opacity-60">
              {busy ? "Création…" : "Créer le compte"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2.5 font-display text-[13.5px] font-bold text-[var(--slate)]">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[340px]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute top-1/2 left-3 h-[15px] w-[15px] -translate-y-1/2 text-[var(--slate)]">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21 L16.5 16.5" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (nom, email, rôle, ville, partenaire…)"
            className="w-full rounded-[40px] border border-[var(--border)] bg-[var(--card)] py-[9px] pr-3 pl-[34px] text-[13px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setRoleFilter("")}
          className={`rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[12px] font-bold ${roleFilter === "" ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--slate)]"}`}
        >
          Tous ({accounts.length})
        </button>
        {ROLE_ORDER.filter((r) => accounts.some((a) => a.role === r)).map((r) => {
          const on = roleFilter === r;
          const c = ROLE_COLOR[r];
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(on ? "" : r)}
              className="flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[12px] font-bold"
              style={on ? { background: c.solid, borderColor: c.solid, color: r === "logisticien" || r === "partenaire" || r === "beneficiaire" || r === "en_attente" ? "#fff" : c.text } : { borderColor: "var(--border)", background: "var(--card)", color: "var(--slate)" }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.solid }} />
              {ROLE_LABELS[r]} ({accounts.filter((a) => a.role === r).length})
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["Nom", "Email", "Rôle", "Ville", "Sites / associations reliés", "Statut", ""].map((h) => (
                <th key={h} className="border-b border-[var(--border)] px-3 py-3 text-left text-[10px] font-bold tracking-[0.03em] whitespace-nowrap text-[var(--muted)] uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[var(--slate)]">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[var(--slate)]">
                  Aucun compte ne correspond à cette recherche.
                </td>
              </tr>
            )}
            {filtered.map((a) => {
              const isEditing = editingId === a.id && draft;
              if (isEditing && draft) {
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="border-b border-[var(--border)] px-3 py-2.5">
                        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder="Nom" />
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--slate)]">{draft.email}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2.5">
                        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })} className={inputCls}>
                          {ROLE_ORDER.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2.5">
                        <select value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value || null })} className={inputCls}>
                          <option value="">—</option>
                          {cities.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2.5 text-[11px] text-[var(--slate)] italic">{draft.role === "partenaire" || draft.role === "beneficiaire" ? "à choisir ci-dessous" : "—"}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2.5">
                        <select value={draft.active ? "1" : "0"} onChange={(e) => setDraft({ ...draft, active: e.target.value === "1" })} className={inputCls}>
                          <option value="1">Actif</option>
                          <option value="0">Inactif</option>
                        </select>
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2.5">
                        <div className="flex gap-1.5">
                          <button type="button" onClick={saveEdit} title="Enregistrer" className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                              <path d="M20 6 L9 17 L4 12" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            title="Annuler"
                            onClick={() => {
                              setEditingId(null);
                              setDraft(null);
                            }}
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                              <path d="M6 6 L18 18 M18 6 L6 18" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={7} className="border-b border-[var(--border)] bg-[var(--input-bg)] px-3 py-3">
                        {draft.role === "partenaire" && (
                          <div className="mb-3">
                            <div className={labelCls}>Sites auxquels ce compte donne accès</div>
                            {partnerChoices(draft.city, draft.partnerIds, (id) =>
                              setDraft({ ...draft, partnerIds: draft.partnerIds.includes(id) ? draft.partnerIds.filter((x) => x !== id) : [...draft.partnerIds, id] }),
                            )}
                          </div>
                        )}
                        {draft.role === "beneficiaire" && (
                          <div className="mb-3">
                            <div className={labelCls}>Associations auxquelles ce compte donne accès</div>
                            {beneficiaryChoices(draft.city, draft.beneficiaryIds, (id) =>
                              setDraft({ ...draft, beneficiaryIds: draft.beneficiaryIds.includes(id) ? draft.beneficiaryIds.filter((x) => x !== id) : [...draft.beneficiaryIds, id] }),
                            )}
                          </div>
                        )}
                        <button type="button" disabled={busy} onClick={() => resetPassword(a)} className="rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 font-display text-[12.5px] font-bold text-[var(--slate)] disabled:opacity-60">
                          Générer un nouveau mot de passe
                        </button>
                      </td>
                    </tr>
                  </Fragment>
                );
              }
              return (
                <tr key={a.id} className="hover:[&>td]:bg-[var(--input-bg)]">
                  <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--navy)]" style={{ boxShadow: `inset 4px 0 0 ${ROLE_COLOR[a.role].solid}` }}>
                    <span className="pl-1.5 font-semibold">{a.name || <span className="text-[var(--muted)] italic">Sans nom</span>}</span>
                    {a.id === me && <span className="ml-1.5 rounded-[40px] bg-[var(--track)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--slate)] uppercase">Toi</span>}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--navy)]">{a.email}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5">
                    <span className="rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap" style={{ background: ROLE_COLOR[a.role].soft, color: ROLE_COLOR[a.role].text }}>
                      {ROLE_LABELS[a.role]}
                    </span>
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5">
                    <span className="text-[11px] font-semibold text-[var(--slate)]">{a.role === "admin_principal" && a.city ? `${cityName(a.city)} (ville de travail · accès à toutes)` : cityName(a.city)}</span>
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5">
                    {a.role === "partenaire" ? (
                      partnerNames(a.partnerIds).length > 0 ? (
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {partnerNames(a.partnerIds).map((n) => (
                            <span key={n} className="rounded-[40px] px-2 py-[3px] text-[10.5px] font-semibold" style={{ background: ROLE_COLOR.partenaire.soft, color: ROLE_COLOR.partenaire.text }}>
                              {n}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-[var(--critical)]">Aucun site relié</span>
                      )
                    ) : a.role === "beneficiaire" ? (
                      beneficiaryNames(a.beneficiaryIds).length > 0 ? (
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {beneficiaryNames(a.beneficiaryIds).map((n) => (
                            <span key={n} className="rounded-[40px] px-2 py-[3px] text-[10.5px] font-semibold" style={{ background: ROLE_COLOR.beneficiaire.soft, color: ROLE_COLOR.beneficiaire.text }}>
                              {n}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-[var(--critical)]">Aucune association reliée</span>
                      )
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--navy)]">
                    <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${a.active ? "bg-[var(--good)]" : "bg-[var(--muted)]"}`} />
                    {a.active ? "Actif" : "Inactif"}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5">
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => startEdit(a)} title="Modifier" className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          <path d="M4 20 L4.8 16.5 L16 5.3 C16.8 4.5,18 4.5,18.8 5.3 L18.7 5.2 C19.5 6,19.5 7.2,18.7 8 L7.5 19.2 Z M14 7 L17 10" />
                        </svg>
                      </button>
                      {a.id !== me && (
                        <button type="button" onClick={() => setConfirmDelete(a)} title="Supprimer ce compte" className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7 M10 11 V16 M14 11 V16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-[26px] rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-4 text-xs leading-[1.6] text-[var(--slate)]">
        <strong className="text-[var(--navy)]">Comment ça fonctionne :</strong> le <strong className="text-[var(--navy)]">Superadmin</strong> accède à toutes les villes ; sa « ville de travail » sert seulement à créer
        les nouveaux éléments. Un <strong className="text-[var(--navy)]">Responsable d&apos;antenne</strong>, un <strong className="text-[var(--navy)]">Resp. Distribution</strong> ou un <strong className="text-[var(--navy)]">Logisticien</strong> est rattaché à une seule ville et ne voit
        que celle-ci. Un <strong className="text-[var(--navy)]">Partenaire</strong> voit uniquement les sites cochés. Un compte <strong className="text-[var(--navy)]">En attente</strong> ou <strong className="text-[var(--navy)]">Inactif</strong>{" "}
        ne donne accès à rien.
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4" onClick={() => !busy && setConfirmDelete(null)}>
          <div className="w-full max-w-[420px] rounded-[20px] bg-[var(--card)] p-6 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--critical-bg)] text-[var(--critical)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7" />
              </svg>
            </div>
            <h3 className="font-display text-[20px] font-black text-[var(--navy)]">Supprimer ce compte ?</h3>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-[var(--slate)]">
              <strong className="text-[var(--navy)]">{confirmDelete.name || "Sans nom"}</strong> ({confirmDelete.email}) — {ROLE_LABELS[confirmDelete.role]}.
            </p>
            <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--slate)]">Cette action est <strong>définitive</strong> : la personne ne pourra plus se connecter. Si elle a déjà travaillé, désactive-la plutôt pour garder l&apos;historique.</p>
            <div className="mt-5 flex gap-2.5">
              <button type="button" autoFocus disabled={busy} onClick={() => setConfirmDelete(null)} className="flex-1 rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-3 font-display text-[14px] font-bold text-[var(--navy)]">
                Annuler
              </button>
              <button type="button" disabled={busy} onClick={deleteAccount} className="flex-1 rounded-[40px] bg-[var(--critical)] px-4 py-3 font-display text-[14px] font-bold text-white disabled:opacity-60">
                {busy ? "Suppression…" : "Oui, supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[420px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
    </div>
  );
}
