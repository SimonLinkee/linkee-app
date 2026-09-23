"use client";

import { useState } from "react";

type Role = "admin_principal" | "admin_local" | "logisticien";
type City = { id: string; name: string; status: "active" | "setup"; since: string };
type Account = { id: number; name: string; email: string; role: Role; city: string | null; active: boolean };

const ROLE_LABELS: Record<Role, string> = { admin_principal: "Admin principal", admin_local: "Admin local", logisticien: "Logisticien" };

const INITIAL_CITIES: City[] = [
  { id: "lyon", name: "Lyon", status: "active", since: "Active depuis janvier 2024" },
  { id: "marseille", name: "Marseille", status: "setup", since: "En cours de paramétrage" },
];

const INITIAL_ACCOUNTS: Account[] = [
  { id: 1, name: "Simon", email: "simon@linkee.org", role: "admin_principal", city: null, active: true },
  { id: 2, name: "Akram", email: "akram@linkee.org", role: "logisticien", city: "lyon", active: true },
  { id: 3, name: "Léa Bonnard", email: "lea.bonnard@linkee.org", role: "admin_local", city: "lyon", active: true },
  { id: 4, name: "Mehdi Salah", email: "mehdi.salah@linkee.org", role: "logisticien", city: "marseille", active: false },
];

function countPartners(cityId: string) {
  return cityId === "lyon" ? 7 : 0;
}
function countBenef(cityId: string) {
  return cityId === "lyon" ? 4 : 0;
}

export default function VillesComptesPage() {
  const [cities, setCities] = useState<City[]>(INITIAL_CITIES);
  const [accounts, setAccounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [addingCity, setAddingCity] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  let nextId = Math.max(...accounts.map((a) => a.id)) + 1;

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }

  function cityName(id: string | null) {
    return cities.find((c) => c.id === id)?.name || "—";
  }
  function countByCity(cityId: string, role: Role) {
    return accounts.filter((a) => a.city === cityId && a.role === role).length;
  }

  function addCity() {
    const name = newCityName.trim();
    if (!name) return;
    const id = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
    setCities((prev) => [...prev, { id, name, status: "setup", since: "Ajoutée aujourd'hui" }]);
    setAddingCity(false);
    setNewCityName("");
    showToast(`Ville « ${name} » ajoutée — reste à y rattacher des comptes et des partenaires.`);
  }

  function startEdit(a: Account) {
    setEditingId(a.id);
    setDraft({ ...a });
  }

  function saveEdit() {
    if (!draft) return;
    const finalDraft = draft.role === "admin_principal" ? { ...draft, city: null } : draft;
    setAccounts((prev) => prev.map((a) => (a.id === finalDraft.id ? finalDraft : a)));
    setEditingId(null);
    setDraft(null);
    showToast("Compte mis à jour.");
  }

  function addAccount() {
    const a: Account = { id: nextId, name: "Nouveau compte", email: "", role: "logisticien", city: cities[0]?.id || null, active: true };
    nextId += 1;
    setAccounts((prev) => [...prev, a]);
    startEdit(a);
  }

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Villes &amp; comptes</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">Pilotage multi-villes de Linkee.</p>

      <div className="mb-[22px] flex items-center gap-2.5 rounded-[14px] bg-[var(--navy-deep)] px-4 py-[11px] text-[12.5px] font-semibold text-[var(--panel-fg)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] flex-none text-[var(--turquoise)]">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10 V7 A4 4 0 0 1 16 7 V10" />
        </svg>
        <span>
          Réservé à l&apos;<strong>admin principal</strong> — un admin local ne voit ni cet écran, ni les autres villes.
        </span>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="font-display text-[22px] font-black">Villes</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--slate)]">Chaque ville est une base de données séparée : partenaires, bénéficiaires, planning, stock, flotte.</p>
        </div>
        <button
          type="button"
          onClick={() => setAddingCity(true)}
          className="flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13px] font-bold text-[var(--panel-fg)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
          Ajouter une ville
        </button>
      </div>

      <div className="mb-[34px] grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {cities.map((c) => (
          <div key={c.id} className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-[19px] font-extrabold text-[var(--navy)]">{c.name}</span>
              <span
                className={`rounded-[40px] px-[9px] py-1 text-[9.5px] font-bold uppercase ${
                  c.status === "active" ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"
                }`}
              >
                {c.status === "active" ? "Active" : "À paramétrer"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="text-[11px] text-[var(--slate)]">
                Partenaires
                <strong className="block font-display text-[17px] font-extrabold text-[var(--navy)]">{countPartners(c.id)}</strong>
              </div>
              <div className="text-[11px] text-[var(--slate)]">
                Bénéficiaires
                <strong className="block font-display text-[17px] font-extrabold text-[var(--navy)]">{countBenef(c.id)}</strong>
              </div>
              <div className="text-[11px] text-[var(--slate)]">
                Logisticiens
                <strong className="block font-display text-[17px] font-extrabold text-[var(--navy)]">{countByCity(c.id, "logisticien")}</strong>
              </div>
              <div className="text-[11px] text-[var(--slate)]">
                Admins locaux
                <strong className="block font-display text-[17px] font-extrabold text-[var(--navy)]">{countByCity(c.id, "admin_local")}</strong>
              </div>
            </div>
            <div className="mt-3 text-[10.5px] text-[var(--muted)]">{c.since}</div>
          </div>
        ))}

        <div className="flex min-h-[150px] items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-[var(--border)] p-5">
          {addingCity ? (
            <div className="flex flex-col items-center gap-2.5">
              <input
                autoFocus
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                placeholder="Nom de la ville"
                className="w-40 rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-center text-sm outline-none focus:border-[var(--turquoise)]"
              />
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
          <p className="mt-0.5 text-[12.5px] text-[var(--slate)]">Rôle et ville de rattachement de chaque administrateur ou logisticien.</p>
        </div>
        <button
          type="button"
          onClick={addAccount}
          className="flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13px] font-bold text-[var(--panel-fg)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
          Ajouter un compte
        </button>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <table className="w-full min-w-[680px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["Nom", "Email", "Rôle", "Ville", "Statut", ""].map((h) => (
                <th key={h} className="border-b border-[var(--border)] px-3 py-3 text-left text-[10px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const isEditing = editingId === a.id && draft;
              if (isEditing && draft) {
                return (
                  <tr key={a.id}>
                    <td className="border-b border-[var(--border)] px-3 py-2.5">
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        className="w-full rounded-[7px] border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--navy)]"
                      />
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2.5">
                      <input
                        value={draft.email}
                        onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                        className="w-full rounded-[7px] border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--navy)]"
                      />
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2.5">
                      <select
                        value={draft.role}
                        onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
                        className="w-full rounded-[7px] border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--navy)]"
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2.5">
                      <select
                        value={draft.city || cities[0]?.id || ""}
                        disabled={draft.role === "admin_principal"}
                        onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                        className="w-full rounded-[7px] border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--navy)] disabled:opacity-50"
                      >
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2.5">
                      <select
                        value={draft.active ? "1" : "0"}
                        onChange={(e) => setDraft({ ...draft, active: e.target.value === "1" })}
                        className="w-full rounded-[7px] border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--navy)]"
                      >
                        <option value="1">Actif</option>
                        <option value="0">Inactif</option>
                      </select>
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M20 6 L9 17 L4 12" />
                          </svg>
                        </button>
                        <button
                          type="button"
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
                );
              }
              return (
                <tr key={a.id} className="hover:[&>td]:bg-[var(--input-bg)]">
                  <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--navy)]">{a.name}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--navy)]">{a.email}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5">
                    <span
                      className={`rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap ${
                        a.role === "admin_principal"
                          ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]"
                          : a.role === "admin_local"
                            ? "bg-[var(--turquoise)] text-[#04262e]"
                            : "bg-[var(--track)] text-[var(--slate)]"
                      }`}
                    >
                      {ROLE_LABELS[a.role]}
                    </span>
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5">
                    {a.role === "admin_principal" ? (
                      <span className="text-[11px] font-semibold text-[var(--muted)] italic">Toutes les villes</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-[var(--slate)]">{cityName(a.city)}</span>
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5 text-[var(--navy)]">
                    <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${a.active ? "bg-[var(--good)]" : "bg-[var(--muted)]"}`} />
                    {a.active ? "Actif" : "Inactif"}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      title="Modifier"
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M4 20 L4.8 16.5 L16 5.3 C16.8 4.5,18 4.5,18.8 5.3 L18.7 5.2 C19.5 6,19.5 7.2,18.7 8 L7.5 19.2 Z M14 7 L17 10" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-[26px] rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-4 text-xs leading-[1.6] text-[var(--slate)]">
        <strong className="text-[var(--navy)]">Comment ça fonctionne :</strong> un <strong className="text-[var(--navy)]">Admin principal</strong> n&apos;a pas de ville associée — il voit tout,
        partout, comme aujourd&apos;hui. Un <strong className="text-[var(--navy)]">Admin local</strong> ou un <strong className="text-[var(--navy)]">Logisticien</strong> est rattaché à exactement
        une ville ; le reste de l&apos;application (Tableau de bord, Partenaires, Planning, Stock, Flotte) se filtre automatiquement sur cette ville pour lui, sans sélecteur — il n&apos;a tout
        simplement pas la possibilité de voir les autres. Seul l&apos;Admin principal voit apparaître le sélecteur de ville (démonstration sur le Tableau de bord).
      </div>

      {toast && (
        <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[380px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">
          {toast}
        </div>
      )}
    </div>
  );
}
