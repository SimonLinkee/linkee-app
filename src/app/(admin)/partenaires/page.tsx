"use client";

import { useMemo, useState } from "react";

type AccessKey = "digicode" | "quai" | "camion" | "etage" | "horaire";
type AccessFlags = Record<AccessKey, boolean>;
type Contact = { type: string; nom: string; tel: string; mail: string };
type HistoryEntry = { date: string; denree: string; kg: number; status: "ok" | "annulee" };
type DenreeFlags = Record<string, boolean>;

type PartnerEntity = {
  id: string;
  kind: "partner";
  name: string;
  cat: string;
  active: boolean;
  siren: string;
  antenne: string;
  address: string;
  creneau: string;
  denrees: DenreeFlags;
  conditionnement: string;
  access: AccessFlags;
  accessNote: string;
  slotDisplay?: string;
  volumeRange?: string;
  partnerComment?: string;
  dureeCollecte?: number;
  history: HistoryEntry[];
  contacts: Contact[];
  portalEmail?: string;
  linkedSites?: string[];
};

type BeneficiaireEntity = {
  id: string;
  kind: "beneficiaire";
  name: string;
  cat: string;
  pinned?: boolean;
  active: boolean;
  address: string;
  tel: string;
  mail: string;
  access: AccessFlags;
  accessNote: string;
  horaires: string;
  volumesAcceptes: string;
  equipement: { cuisine: boolean; frigo: boolean; chambreFroide: boolean };
  stockageM2: number;
  denrees: DenreeFlags;
  contacts: Contact[];
};

type Entity = PartnerEntity | BeneficiaireEntity;

const DENREE_OPTIONS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const ACCESS_OPTIONS: { k: AccessKey; l: string }[] = [
  { k: "digicode", l: "Digicode" },
  { k: "quai", l: "Quai de livraison" },
  { k: "camion", l: "Accès camion" },
  { k: "etage", l: "Étage / ascenseur" },
  { k: "horaire", l: "Horaire strict" },
];
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#B23B72", "#7C5CD9", "#4FC1D6"];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}
function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function fmtDateFR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const INITIAL_PARTNERS: PartnerEntity[] = [
  {
    id: "p1", kind: "partner", name: "Boulangerie des Terreaux", cat: "Boulangerie", active: true, siren: "812 345 678 00019",
    antenne: "Lyon", address: "12 Rue des Capucins, 69001 Lyon", creneau: "Lundi 08:30–09:00 (hebdomadaire)",
    denrees: { Secs: true, "Fruits et légumes": false, "Produits frais": false, "Plats préparés": true, Boulangerie: true },
    conditionnement: "Carton",
    access: { digicode: true, quai: false, camion: false, etage: false, horaire: false },
    accessNote: "Digicode 2468B, sonner à l'interphone « Linkee ». Livraison par la porte arrière.",
    slotDisplay: "Lundi entre 08h30 et 09h00", volumeRange: "20/50kg",
    partnerComment: "Prévoir un chariot — la porte arrière est un peu étroite en hiver avec la neige.",
    history: [
      { date: "2026-09-22", denree: "Plats préparés", kg: 34, status: "ok" },
      { date: "2026-09-15", denree: "Secs", kg: 29, status: "ok" },
      { date: "2026-09-08", denree: "Plats préparés", kg: 38, status: "ok" },
      { date: "2026-09-01", denree: "Secs", kg: 0, status: "annulee" },
      { date: "2026-08-25", denree: "Plats préparés", kg: 31, status: "ok" },
    ],
    contacts: [
      { type: "Opérationnel", nom: "Camille Roussel", tel: "06 12 34 56 78", mail: "camille.roussel@bakery-terreaux.fr" },
      { type: "Admin", nom: "Julien Faure", tel: "04 78 00 11 22", mail: "contact@bakery-terreaux.fr" },
    ],
  },
  {
    id: "p2", kind: "partner", name: "Supermarché Presqu'île", cat: "Supermarché", active: true, siren: "403 210 987 00027",
    antenne: "Lyon", address: "48 Rue de la République, 69002 Lyon", creneau: "Lundi 09:15–09:45 (hebdomadaire)",
    denrees: { Secs: true, "Fruits et légumes": true, "Produits frais": true, "Plats préparés": true, Boulangerie: false },
    conditionnement: "Palette",
    access: { digicode: false, quai: true, camion: true, etage: true, horaire: false },
    accessNote: "Quai de livraison à l'arrière (hauteur max. 2,10 m). Demander M. Belkacem à l'accueil.",
    history: [],
    contacts: [
      { type: "Opérationnel", nom: "Nadia Belkacem", tel: "06 22 45 67 89", mail: "n.belkacem@supp-presquile.fr" },
      { type: "Comptable", nom: "Hugo Marchand", tel: "04 72 11 22 33", mail: "compta@supp-presquile.fr" },
    ],
  },
  {
    id: "p3", kind: "partner", name: "Traiteur Lumière", cat: "Traiteur", active: true, siren: "521 087 654 00012",
    antenne: "Lyon", address: "5 Rue Romarin, 69001 Lyon", creneau: "Lundi 10:00–10:30 (hebdomadaire)",
    denrees: { Secs: false, "Fruits et légumes": false, "Produits frais": true, "Plats préparés": true, Boulangerie: false },
    conditionnement: "Carton",
    access: { digicode: true, quai: false, camion: false, etage: true, horaire: false },
    accessNote: "Digicode 1479A. 2ème étage, ascenseur au fond du couloir à droite.",
    history: [],
    contacts: [{ type: "Admin", nom: "Élodie Rambert", tel: "06 33 44 55 66", mail: "elodie@traiteur-lumiere.fr" }],
  },
  {
    id: "p4", kind: "partner", name: "Hôtel des Brotteaux", cat: "Hôtel", active: true, siren: "389 456 210 00045",
    antenne: "Lyon", address: "1 Place Jules Ferry, 69006 Lyon", creneau: "Lundi 11:30–12:00 (hebdomadaire)",
    denrees: { Secs: false, "Fruits et légumes": false, "Produits frais": true, "Plats préparés": true, Boulangerie: false },
    conditionnement: "Autre",
    access: { digicode: false, quai: true, camion: false, etage: false, horaire: true },
    accessNote: "Accès par le quai de livraison côté cour. Horaire strict : 11h-12h uniquement.",
    history: [],
    contacts: [{ type: "Opérationnel", nom: "Marc Ferreira", tel: "06 44 55 66 77", mail: "chef@hotel-brotteaux.fr" }],
  },
  {
    id: "p5", kind: "partner", name: "Grossiste Rhône Frais", cat: "Grossiste", active: true, siren: "678 901 234 00033",
    antenne: "Lyon", address: "22 Avenue Jean Mermoz, 69008 Lyon", creneau: "Lundi 14:00–15:00 (hebdomadaire)",
    denrees: { Secs: true, "Fruits et légumes": true, "Produits frais": false, "Plats préparés": false, Boulangerie: false },
    conditionnement: "Palette",
    access: { digicode: false, quai: true, camion: true, etage: false, horaire: true },
    accessNote: "Quai de livraison n°3. Créneau 13h30-15h obligatoire, badge visiteur à l'accueil.",
    history: [],
    contacts: [
      { type: "Admin", nom: "Karim Belaïd", tel: "06 55 66 77 88", mail: "k.belaid@rhone-frais.fr" },
      { type: "Opérationnel", nom: "Sonia Petit", tel: "06 66 77 88 99", mail: "quai@rhone-frais.fr" },
    ],
  },
  {
    id: "p6", kind: "partner", name: "Cantine Léo Lagrange", cat: "Restauration collective", active: true, siren: "112 233 445 00021",
    antenne: "Lyon", address: "8 Rue Léo Lagrange, 69003 Lyon", creneau: "Mardi 13:00–13:30 (une semaine sur deux)",
    denrees: { Secs: false, "Fruits et légumes": true, "Produits frais": true, "Plats préparés": true, Boulangerie: false },
    conditionnement: "Carton",
    access: { digicode: false, quai: true, camion: false, etage: false, horaire: true },
    accessNote: "Livraison en cuisine centrale, horaire 13h-13h30 uniquement (pause service).",
    history: [],
    contacts: [{ type: "Opérationnel", nom: "Patricia Nguyen", tel: "06 77 88 99 00", mail: "cuisine@leolagrange-cantine.fr" }],
  },
  {
    id: "p7", kind: "partner", name: "Frais Distribution Rhône", cat: "Industriel", active: false, siren: "234 567 890 00018",
    antenne: "Lyon", address: "Z.I. des Isles, Rue Louise Michel, 69320 Feyzin", creneau: "Suspendu — en cours de renouvellement de convention",
    denrees: { Secs: false, "Fruits et légumes": false, "Produits frais": true, "Plats préparés": false, Boulangerie: false },
    conditionnement: "Palette",
    access: { digicode: false, quai: true, camion: true, etage: false, horaire: false },
    accessNote: "Quai industriel, chariot élévateur fourni sur place.",
    history: [],
    contacts: [{ type: "Admin", nom: "Thierry Aznar", tel: "06 88 99 00 11", mail: "t.aznar@frais-distribution-rhone.fr" }],
  },
];

const INITIAL_BENEFICIAIRES: BeneficiaireEntity[] = [
  {
    id: "b1", kind: "beneficiaire", name: "HEAT", cat: "Distribution Linkee", pinned: true, active: true,
    address: "70 Quai Perrache, 69002 Lyon", tel: "04 78 00 00 01", mail: "heat@linkee.org",
    access: { digicode: false, quai: true, camion: true, etage: false, horaire: true },
    accessNote: "Livraison quai arrière, créneau 17h-18h.",
    horaires: "Lu-Ve 9h-18h", volumesAcceptes: "Jusqu'à 150 kg / jour",
    equipement: { cuisine: true, frigo: true, chambreFroide: true }, stockageM2: 40,
    denrees: { Secs: true, "Fruits et légumes": true, "Produits frais": true, "Plats préparés": true, Boulangerie: true },
    contacts: [{ type: "Admin", nom: "Sophie N'Diaye", tel: "04 78 00 00 01", mail: "heat@linkee.org" }],
  },
  {
    id: "b2", kind: "beneficiaire", name: "Point de distribution — Rue de Marseille", cat: "Distribution Linkee", pinned: true, active: true,
    address: "90 bis Rue de Marseille, 69007 Lyon", tel: "04 78 00 00 02", mail: "marseille@linkee.org",
    access: { digicode: false, quai: false, camion: true, etage: false, horaire: true },
    accessNote: "Stationnement possible devant, créneau 17h30-18h30.",
    horaires: "Ma-Sa 14h-19h", volumesAcceptes: "Jusqu'à 120 kg / jour",
    equipement: { cuisine: false, frigo: true, chambreFroide: false }, stockageM2: 22,
    denrees: { Secs: true, "Fruits et légumes": true, "Produits frais": true, "Plats préparés": false, Boulangerie: false },
    contacts: [{ type: "Opérationnel", nom: "Adama Koné", tel: "06 11 22 33 44", mail: "adama@linkee.org" }],
  },
  {
    id: "b3", kind: "beneficiaire", name: "Les Grandes Voisines", cat: "Association partenaire", pinned: false, active: true,
    address: "40 Av. de la Table de Pierre, 69340 Francheville", tel: "04 78 12 34 56", mail: "contact@grandesvoisines.org",
    access: { digicode: false, quai: false, camion: false, etage: false, horaire: true },
    accessNote: "Sonner au portail, dépose directement en cuisine partagée.",
    horaires: "Lu, Me, Ve 10h-12h", volumesAcceptes: "Jusqu'à 60 kg / passage",
    equipement: { cuisine: true, frigo: true, chambreFroide: false }, stockageM2: 15,
    denrees: { Secs: true, "Fruits et légumes": true, "Produits frais": true, "Plats préparés": false, Boulangerie: false },
    contacts: [{ type: "Admin", nom: "Isabelle Chevrier", tel: "04 78 12 34 56", mail: "contact@grandesvoisines.org" }],
  },
  {
    id: "b4", kind: "beneficiaire", name: "Épicerie Sociale Saint-Camille de Vaise", cat: "Association partenaire", pinned: false, active: true,
    address: "26 Rue du Bourbonnais, 69009 Lyon", tel: "04 78 65 43 21", mail: "epicerie@saintcamillevaise.org",
    access: { digicode: false, quai: false, camion: false, etage: false, horaire: false },
    accessNote: "Sonner à l'accueil, dépose directement au réfectoire.",
    horaires: "Ma-Je 9h-12h et 14h-17h", volumesAcceptes: "Jusqu'à 80 kg / passage",
    equipement: { cuisine: false, frigo: true, chambreFroide: true }, stockageM2: 18,
    denrees: { Secs: false, "Fruits et légumes": false, "Produits frais": true, "Plats préparés": true, Boulangerie: false },
    contacts: [{ type: "Opérationnel", nom: "Bernard Foulon", tel: "04 78 65 43 21", mail: "epicerie@saintcamillevaise.org" }],
  },
];

function AccessChips({ access, onToggle }: { access: AccessFlags; onToggle: (k: AccessKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACCESS_OPTIONS.map((opt) => (
        <label
          key={opt.k}
          className={`inline-flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3.5 py-2 text-xs font-semibold ${
            access[opt.k] ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
          }`}
        >
          <input type="checkbox" checked={access[opt.k]} onChange={() => onToggle(opt.k)} className="hidden" />
          {access[opt.k] && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M20 6 L9 17 L4 12" />
            </svg>
          )}
          <span>{opt.l}</span>
        </label>
      ))}
    </div>
  );
}

function DenreeChips({ denrees, onToggle }: { denrees: DenreeFlags; onToggle: (d: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DENREE_OPTIONS.map((d) => (
        <label
          key={d}
          className={`inline-flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3.5 py-2 text-xs font-semibold ${
            denrees[d] ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
          }`}
        >
          <input type="checkbox" checked={!!denrees[d]} onChange={() => onToggle(d)} className="hidden" />
          {denrees[d] && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M20 6 L9 17 L4 12" />
            </svg>
          )}
          <span>{d}</span>
        </label>
      ))}
    </div>
  );
}

function AccordionSection({
  title,
  sectionKey,
  open,
  onToggle,
  children,
}: {
  title: string;
  sectionKey: string;
  open: boolean;
  onToggle: (k: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 overflow-hidden rounded-[14px] border border-[var(--border)]">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center justify-between bg-[var(--input-bg)] px-4 py-[13px] text-left"
      >
        <h4 className="font-display text-[15px] font-extrabold text-[var(--navy)]">{title}</h4>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-[15px] w-[15px] text-[var(--slate)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9 L12 15 L18 9" />
        </svg>
      </button>
      {open && <div className="border-t border-[var(--border)] p-4">{children}</div>}
    </div>
  );
}

const inputCls =
  "w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-[5px] block text-[11.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";

export default function PartenairesPage() {
  const [partners, setPartners] = useState<PartnerEntity[]>(INITIAL_PARTNERS);
  const [beneficiaires, setBeneficiaires] = useState<BeneficiaireEntity[]>(INITIAL_BENEFICIAIRES);
  const [tab, setTab] = useState<"partner" | "beneficiaire">("partner");
  const [currentId, setCurrentId] = useState("p1");
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["identite"]));
  const [autosaveVisible, setAutosaveVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const list: Entity[] = tab === "partner" ? partners : beneficiaires;
  const current = useMemo(() => list.find((e) => e.id === currentId), [list, currentId]);

  function flashAutosave() {
    setAutosaveVisible(true);
    window.clearTimeout((flashAutosave as unknown as { t?: number }).t);
    (flashAutosave as unknown as { t?: number }).t = window.setTimeout(() => setAutosaveVisible(false), 1600);
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }

  function updatePartner(id: string, updater: (p: PartnerEntity) => PartnerEntity) {
    setPartners((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
    flashAutosave();
  }
  function updateBeneficiaire(id: string, updater: (b: BeneficiaireEntity) => BeneficiaireEntity) {
    setBeneficiaires((prev) => prev.map((b) => (b.id === id ? updater(b) : b)));
    flashAutosave();
  }
  function updateEntity(updater: (e: Entity) => Entity) {
    if (!current) return;
    if (current.kind === "partner") updatePartner(current.id, updater as (p: PartnerEntity) => PartnerEntity);
    else updateBeneficiaire(current.id, updater as (b: BeneficiaireEntity) => BeneficiaireEntity);
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function switchTab(next: "partner" | "beneficiaire") {
    setTab(next);
    setSearch("");
    const firstId = (next === "partner" ? partners : beneficiaires)[0]?.id;
    if (firstId) setCurrentId(firstId);
    setOpenSections(new Set(["identite"]));
  }

  const filteredList = list.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  const pinned = filteredList.filter((e) => e.kind === "beneficiaire" && e.pinned);
  const rest = filteredList.filter((e) => !(e.kind === "beneficiaire" && e.pinned));

  function Row({ e }: { e: Entity }) {
    const active = e.id === currentId;
    return (
      <div
        onClick={() => setCurrentId(e.id)}
        className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] px-2.5 py-[9px] ${
          active ? "border-[var(--turquoise)] bg-[var(--track)]" : "border-transparent hover:bg-[var(--input-bg)]"
        }`}
      >
        <span
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full font-display text-sm font-bold text-white"
          style={{ background: colorFor(e.name) }}
        >
          {initials(e.name)}
        </span>
        <span className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-[var(--navy)]">{e.name}</div>
          <div className="text-[11px] text-[var(--slate)]">{e.cat}</div>
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          {e.kind === "beneficiaire" && e.pinned && (
            <span className="rounded-[40px] bg-[var(--turquoise)] px-1.5 py-0.5 text-[9px] font-bold text-[#04262e] uppercase">Linkee</span>
          )}
          <span className={`h-2 w-2 rounded-full ${e.active ? "bg-[var(--good)]" : "bg-[var(--muted)]"}`} />
        </span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">{tab === "partner" ? "Partenaires" : "Bénéficiaires"}</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">
        {tab === "partner"
          ? "Fiches d'identité des commerces qui donnent leurs invendus — modifiables directement ici."
          : "Fiches des associations et points de distribution qui reçoivent les denrées."}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px] shadow-[var(--shadow)]">
          <button
            type="button"
            onClick={() => switchTab("partner")}
            className={`rounded-[40px] px-[18px] py-2 font-display text-[13.5px] font-bold ${tab === "partner" ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}
          >
            Partenaires
          </button>
          <button
            type="button"
            onClick={() => switchTab("beneficiaire")}
            className={`rounded-[40px] px-[18px] py-2 font-display text-[13.5px] font-bold ${tab === "beneficiaire" ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}
          >
            Bénéficiaires
          </button>
        </div>
        <div className="relative max-w-[280px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute top-1/2 left-3 h-[15px] w-[15px] -translate-y-1/2 text-[var(--slate)]">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21 L16.5 16.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom..."
            className="w-full rounded-[40px] border border-[var(--border)] bg-[var(--card)] py-[9px] pr-3 pl-[34px] text-[13px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
          />
        </div>
        <button
          type="button"
          onClick={() => showToast("Aperçu uniquement — la création de fiche sera branchée à Supabase.")}
          className="ml-auto flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
          <span>{tab === "partner" ? "Ajouter un partenaire" : "Ajouter un bénéficiaire"}</span>
        </button>
      </div>

      <div className="mt-[18px] grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[330px_1fr]">
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[var(--shadow)]">
          {filteredList.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">Aucun résultat.</p>}
          {pinned.length > 0 && (
            <>
              <div className="px-2.5 pt-2.5 pb-1.5 text-[10.5px] font-bold tracking-[0.05em] text-[var(--muted)] uppercase">Distributions Linkee</div>
              {pinned.map((e) => (
                <Row key={e.id} e={e} />
              ))}
              <div className="px-2.5 pt-2.5 pb-1.5 text-[10.5px] font-bold tracking-[0.05em] text-[var(--muted)] uppercase">
                {tab === "partner" ? "Tous les partenaires" : "Associations partenaires"}
              </div>
            </>
          )}
          {rest.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </div>

        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-7 pt-[26px] pb-[30px] shadow-[var(--shadow)]">
          {!current ? (
            <div className="flex flex-col items-center gap-2.5 py-[60px] text-center text-[var(--slate)]">
              <p>Sélectionnez une fiche dans la liste.</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-start gap-[18px]">
                <div
                  onClick={() => showToast("Aperçu uniquement — l'upload de logo sera branché à Supabase Storage.")}
                  className="group relative flex h-[66px] w-[66px] flex-none cursor-pointer items-center justify-center rounded-[20px] font-display text-[22px] font-extrabold text-white"
                  style={{ background: colorFor(current.name) }}
                  title="Changer le logo"
                >
                  {initials(current.name)}
                  <span className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-[rgba(0,22,65,0.55)] opacity-0 transition-opacity group-hover:opacity-100">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] text-white">
                      <path d="M4 8 L7 4 H17 L20 8" />
                      <rect x="3" y="8" width="18" height="12" rx="2" />
                      <circle cx="12" cy="14" r="3.2" />
                    </svg>
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    value={current.name}
                    onChange={(e) => updateEntity((entity) => ({ ...entity, name: e.target.value }))}
                    className="w-full rounded-lg border-b-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-display text-[27px] font-black text-[var(--navy)] outline-none hover:border-b-[var(--turquoise)] hover:bg-[var(--input-bg)] focus:border-b-[var(--turquoise)] focus:bg-[var(--input-bg)]"
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <select
                      value={current.cat}
                      onChange={(e) => updateEntity((entity) => ({ ...entity, cat: e.target.value }))}
                      className="cursor-pointer rounded-[40px] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-[5px] text-[12.5px] font-semibold text-[var(--slate)]"
                    >
                      {(current.kind === "partner"
                        ? ["Boulangerie", "Supermarché", "Traiteur", "Hôtel", "Restauration rapide", "Restauration collective", "Industriel", "Grossiste"]
                        : ["Distribution Linkee", "Association partenaire"]
                      ).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    {current.kind === "partner" && <span className="text-[11.5px] text-[var(--muted)]">SIREN {current.siren}</span>}
                    {current.kind === "beneficiaire" && current.pinned && (
                      <span className="rounded-[40px] bg-[var(--turquoise)] px-2.5 py-1 text-[10.5px] font-bold text-[#04262e] uppercase">Distribution Linkee</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--slate)]">
                    {current.active ? "Actif — visible dans l'app du logisticien" : "Inactif — masqué de l'app du logisticien"}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateEntity((entity) => ({ ...entity, active: !entity.active }))}
                    className={`relative h-[21px] w-[38px] rounded-[40px] transition-colors ${current.active ? "bg-[var(--good)]" : "bg-[var(--track)]"}`}
                  >
                    <span
                      className="absolute top-0.5 h-[17px] w-[17px] rounded-full bg-white shadow transition-[left]"
                      style={{ left: current.active ? 19 : 2 }}
                    />
                  </button>
                </div>
              </div>
              <div className={`mb-4 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${autosaveVisible ? "opacity-100" : "opacity-0"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                  <path d="M20 6 L9 17 L4 12" />
                </svg>
                Modifications enregistrées
              </div>

              <AccordionSection title="Adresse & accès" sectionKey="identite" open={openSections.has("identite")} onToggle={toggleSection}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Adresse</label>
                    <input className={inputCls} value={current.address} onChange={(e) => updateEntity((entity) => ({ ...entity, address: e.target.value }))} />
                  </div>
                  {current.kind === "partner" && (
                    <div>
                      <label className={labelCls}>Antenne</label>
                      <input className={inputCls} value={current.antenne} onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, antenne: e.target.value } : entity))} />
                    </div>
                  )}
                  {current.kind === "partner" && (
                    <div>
                      <label className={labelCls}>Créneau de collecte</label>
                      <input className={inputCls} value={current.creneau} onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, creneau: e.target.value } : entity))} />
                    </div>
                  )}
                  {current.kind === "beneficiaire" && (
                    <div>
                      <label className={labelCls}>Téléphone</label>
                      <input className={inputCls} value={current.tel} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, tel: e.target.value } : entity))} />
                    </div>
                  )}
                  {current.kind === "beneficiaire" && (
                    <div>
                      <label className={labelCls}>Email</label>
                      <input className={inputCls} value={current.mail} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, mail: e.target.value } : entity))} />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Conditions d&apos;accès</label>
                    <AccessChips
                      access={current.access}
                      onToggle={(k) => updateEntity((entity) => ({ ...entity, access: { ...entity.access, [k]: !entity.access[k] } }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Détails d&apos;accès (texte libre)</label>
                    <textarea
                      className={`${inputCls} min-h-[56px] resize-y`}
                      value={current.accessNote}
                      onChange={(e) => updateEntity((entity) => ({ ...entity, accessNote: e.target.value }))}
                    />
                  </div>
                </div>
              </AccordionSection>

              {current.kind === "partner" && (
                <AccordionSection title="Denrées & logistique" sectionKey="logistics" open={openSections.has("logistics")} onToggle={toggleSection}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Types de denrées gérés</label>
                      <DenreeChips
                        denrees={current.denrees}
                        onToggle={(d) => updateEntity((entity) => ({ ...entity, denrees: { ...entity.denrees, [d]: !entity.denrees[d] } }))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Conditionnement</label>
                      <select
                        className={inputCls}
                        value={current.conditionnement}
                        onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, conditionnement: e.target.value } : entity))}
                      >
                        {["Carton", "Palette", "Autre"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Durée de collecte sur place (min)</label>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        className={inputCls}
                        value={current.dureeCollecte || 10}
                        onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, dureeCollecte: +e.target.value || 10 } : entity))}
                      />
                    </div>
                  </div>
                </AccordionSection>
              )}

              {current.kind === "partner" && (
                <AccordionSection title='Cadre "Informations de collecte" (visible côté partenaire)' sectionKey="partnerspace" open={openSections.has("partnerspace")} onToggle={toggleSection}>
                  <p className="mb-3 text-[11.5px] text-[var(--slate)]">Ces champs s&apos;affichent en lecture seule dans l&apos;espace du partenaire — lui seul ne peut pas les modifier.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Créneau habituel (texte affiché)</label>
                      <input
                        className={inputCls}
                        placeholder="Ex : Lundi entre 08h30 et 09h00"
                        value={current.slotDisplay || ""}
                        onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, slotDisplay: e.target.value } : entity))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Volume estimatif habituel</label>
                      <select
                        className={inputCls}
                        value={current.volumeRange || "10/20kg"}
                        onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, volumeRange: e.target.value } : entity))}
                      >
                        {["10/20kg", "20/50kg", "50/100kg", "100/250kg", "250/500kg", "+500kg"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Commentaire visible par le partenaire (optionnel)</label>
                      <textarea
                        className={`${inputCls} min-h-[56px] resize-y`}
                        value={current.partnerComment || ""}
                        onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, partnerComment: e.target.value } : entity))}
                      />
                    </div>
                  </div>
                </AccordionSection>
              )}

              {current.kind === "beneficiaire" && (
                <AccordionSection title="Accueil & équipements" sectionKey="accueil" open={openSections.has("accueil")} onToggle={toggleSection}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Horaires d&apos;ouverture</label>
                      <input className={inputCls} value={current.horaires} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, horaires: e.target.value } : entity))} />
                    </div>
                    <div>
                      <label className={labelCls}>Volumes acceptés</label>
                      <input className={inputCls} value={current.volumesAcceptes} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, volumesAcceptes: e.target.value } : entity))} />
                    </div>
                    <div>
                      <label className={labelCls}>Surface de stockage (m²)</label>
                      <input
                        type="number"
                        className={inputCls}
                        value={current.stockageM2}
                        onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, stockageM2: +e.target.value || 0 } : entity))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Typologie de denrées acceptées</label>
                      <DenreeChips
                        denrees={current.denrees}
                        onToggle={(d) => updateEntity((entity) => ({ ...entity, denrees: { ...entity.denrees, [d]: !entity.denrees[d] } }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Équipement sur place</label>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["cuisine", "Cuisine"],
                            ["frigo", "Frigo"],
                            ["chambreFroide", "Chambre froide"],
                          ] as const
                        ).map(([k, l]) => (
                          <label
                            key={k}
                            className={`inline-flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3.5 py-2 text-xs font-semibold ${
                              current.equipement[k] ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={current.equipement[k]}
                              onChange={() =>
                                updateEntity((entity) =>
                                  entity.kind === "beneficiaire" ? { ...entity, equipement: { ...entity.equipement, [k]: !entity.equipement[k] } } : entity
                                )
                              }
                            />
                            {current.equipement[k] && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                <path d="M20 6 L9 17 L4 12" />
                              </svg>
                            )}
                            <span>{l}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </AccordionSection>
              )}

              {current.kind === "partner" && (
                <AccordionSection title="Historique des collectes" sectionKey="history" open={openSections.has("history")} onToggle={toggleSection}>
                  <p className="mb-3 text-[11.5px] text-[var(--slate)]">Quantités collectées, modifiables à tout moment (ex : correction après une saisie du logisticien).</p>
                  {current.history.length === 0 ? (
                    <p className="text-xs text-[var(--slate)]">Aucune collecte enregistrée pour l&apos;instant.</p>
                  ) : (
                    current.history.map((h, idx) => (
                      <div key={idx} className="grid grid-cols-[90px_1fr_120px] items-center gap-2.5 border-b border-[var(--border)] py-2.5 last:border-none">
                        <span className="text-xs font-bold text-[var(--navy)]">{fmtDateFR(h.date)}</span>
                        <span className="text-xs text-[var(--slate)]">{h.denree}</span>
                        {h.status === "annulee" ? (
                          <span className="justify-self-end rounded-[40px] bg-[var(--critical-bg)] px-2.5 py-1 text-[10px] font-bold text-[var(--critical)] uppercase">Annulée</span>
                        ) : (
                          <span className="flex items-center justify-self-end gap-1.5">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={h.kg}
                              onChange={(e) =>
                                updateEntity((entity) => {
                                  if (entity.kind !== "partner") return entity;
                                  const history = entity.history.map((row, i) => (i === idx ? { ...row, kg: parseFloat(e.target.value) || 0 } : row));
                                  return { ...entity, history };
                                })
                              }
                              onBlur={() => showToast("Volume corrigé — visible immédiatement dans les statistiques du partenaire.")}
                              className="w-16 rounded-lg border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2 py-[5px] text-right text-[12.5px] font-bold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                            />
                            <span className="text-[11px] text-[var(--slate)]">kg</span>
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </AccordionSection>
              )}

              <AccordionSection title="Contacts" sectionKey="contacts" open={openSections.has("contacts")} onToggle={toggleSection}>
                <div className="mb-2.5 flex flex-col gap-2.5">
                  {current.contacts.map((c, idx) => (
                    <div key={idx} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[110px_1fr_1fr_1fr_30px]">
                      <select
                        className="rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12.5px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                        value={c.type}
                        onChange={(e) =>
                          updateEntity((entity) => ({ ...entity, contacts: entity.contacts.map((row, i) => (i === idx ? { ...row, type: e.target.value } : row)) }))
                        }
                      >
                        {["Admin", "Opérationnel", "Comptable"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        className="rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12.5px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                        placeholder="Nom"
                        value={c.nom}
                        onChange={(e) => updateEntity((entity) => ({ ...entity, contacts: entity.contacts.map((row, i) => (i === idx ? { ...row, nom: e.target.value } : row)) }))}
                      />
                      <input
                        className="rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12.5px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                        placeholder="Téléphone"
                        value={c.tel}
                        onChange={(e) => updateEntity((entity) => ({ ...entity, contacts: entity.contacts.map((row, i) => (i === idx ? { ...row, tel: e.target.value } : row)) }))}
                      />
                      <input
                        className="rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12.5px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                        placeholder="Email"
                        value={c.mail}
                        onChange={(e) => updateEntity((entity) => ({ ...entity, contacts: entity.contacts.map((row, i) => (i === idx ? { ...row, mail: e.target.value } : row)) }))}
                      />
                      <button
                        type="button"
                        onClick={() => updateEntity((entity) => ({ ...entity, contacts: entity.contacts.filter((_, i) => i !== idx) }))}
                        className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                          <path d="M6 6 L18 18 M18 6 L6 18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateEntity((entity) => ({ ...entity, contacts: [...entity.contacts, { type: "Opérationnel", nom: "", tel: "", mail: "" }] }));
                    setOpenSections((prev) => new Set(prev).add("contacts"));
                  }}
                  className="w-full rounded-[11px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] py-2 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                >
                  + Ajouter un contact
                </button>
              </AccordionSection>

              {current.kind === "partner" && (
                <AccordionSection title="Accès espace partenaire" sectionKey="portal" open={openSections.has("portal")} onToggle={toggleSection}>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className={labelCls}>Email de connexion à l&apos;espace partenaire</label>
                      <input
                        className={inputCls}
                        placeholder="contact@partenaire.fr"
                        value={current.portalEmail || ""}
                        onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, portalEmail: e.target.value } : entity))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Sites rattachés à ce même compte (menu déroulant côté partenaire)</label>
                      <div className="flex flex-wrap gap-2">
                        {partners
                          .filter((p) => p.id !== current.id)
                          .map((p) => {
                            const linked = (current.linkedSites || []).includes(p.id);
                            return (
                              <label
                                key={p.id}
                                className={`inline-flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3.5 py-2 text-xs font-semibold ${
                                  linked ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={linked}
                                  onChange={() =>
                                    updateEntity((entity) => {
                                      if (entity.kind !== "partner") return entity;
                                      const sites = new Set(entity.linkedSites || []);
                                      if (sites.has(p.id)) sites.delete(p.id);
                                      else sites.add(p.id);
                                      return { ...entity, linkedSites: Array.from(sites) };
                                    })
                                  }
                                />
                                {linked && (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                    <path d="M20 6 L9 17 L4 12" />
                                  </svg>
                                )}
                                <span>{p.name}</span>
                              </label>
                            );
                          })}
                      </div>
                      <p className="mt-2 text-[11.5px] text-[var(--slate)]">
                        Un même partenaire (ex. plusieurs boutiques d&apos;une même enseigne) peut ainsi basculer entre ses sites depuis un seul identifiant, sans recréer un compte à chaque fois.
                      </p>
                    </div>
                  </div>
                </AccordionSection>
              )}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[360px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">
          {toast}
        </div>
      )}
    </div>
  );
}
