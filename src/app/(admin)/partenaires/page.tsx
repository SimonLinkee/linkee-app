"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { canAdminCity } from "@/lib/roles";
import { PASSAGE_ITEMS, PassageIcon, type Passage } from "@/components/PassageIcons";
import PartnerDocuments from "@/components/partner/PartnerDocuments";
import PartnerValuation from "@/components/partner/PartnerValuation";
import PartnerCollectes from "@/components/partner/PartnerCollectes";
import BeneficiaryMap from "@/components/partner/BeneficiaryMap";
import PartnerMap from "@/components/partner/PartnerMap";
import AddressSearch from "@/components/AddressSearch";
import BetaBadge from "@/components/BetaBadge";
import SirenField from "@/components/partner/SirenField";
import type { SirenInfo } from "@/lib/siren";
import { formatCreneaux, type Creneaux, type Slot as CreneauSlot } from "@/lib/creneaux";
import { CERFA_FREQUENCIES, type CerfaFrequency } from "@/lib/cerfa";

type FicheTab = "fiche" | "documents" | "valorisation" | "collectes";

// Binder-style tabs: brand colours (navy, stock amber, "dépose" green, turquoise); text flips to navy on light fills.
const FICHE_TABS: { k: FicheTab; label: string; color: string; fg: string; icon: React.ReactNode }[] = [
  { k: "fiche", label: "Fiche", color: "#0a1a3f", fg: "#fdf4ed", icon: <><path d="M4 8 L8 4 H16 L20 8" /><rect x="4" y="8" width="16" height="12" rx="1.5" /><path d="M10 20 V14 H14 V20" /></> },
  { k: "documents", label: "Mes documents", color: "#eda100", fg: "#001641", icon: <path d="M3 7 A2 2 0 0 1 5 5 H9 L11 7.5 H19 A2 2 0 0 1 21 9.5 V17 A2 2 0 0 1 19 19 H5 A2 2 0 0 1 3 17 Z" /> },
  { k: "valorisation", label: "Valorisation RSE", color: "#1a8f68", fg: "#fdf4ed", icon: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.2 A3.6 3.6 0 1 0 14.8 14.8 M8.5 11 H13 M8.5 13 H13" /></> },
  { k: "collectes", label: "Collectes", color: "#4fc1d6", fg: "#001641", icon: <><path d="M3 6.5 H14 V16 H3 Z M14 9.5 H18 L21 12.5 V16 H14" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></> },
];
const BENEFICIAIRE_FICHE_TABS = FICHE_TABS.filter((t) => t.k === "fiche" || t.k === "documents");
// Coloured top edge of each fiche card
const SECTION_COLOR: Record<string, string> = {
  identite: "var(--cat-1)",
  logistics: "var(--cat-4)",
  passage: "var(--turquoise)",
  partnerspace: "var(--client-req)",
  accueil: "var(--dropoff)",
  contacts: "var(--cat-2)",
  portal: "#0a1a3f",
  creneaux: "var(--cat-3)",
};

type AccessKey = "digicode" | "quai" | "camion" | "etage" | "horaire";
type AccessFlags = Record<AccessKey, boolean>;
type Contact = { type: string; nom: string; tel: string; mail: string };
type HistoryEntry = { date: string; denree: string; kg: number; status: "ok" | "annulee" };
type DenreeFlags = Record<string, boolean>;
type Hours = { open: string; close: string } | null;
const DAYS = [
  { k: "lun", l: "Lundi" }, { k: "mar", l: "Mardi" }, { k: "mer", l: "Mercredi" }, { k: "jeu", l: "Jeudi" },
  { k: "ven", l: "Vendredi" }, { k: "sam", l: "Samedi" }, { k: "dim", l: "Dimanche" },
];

type PartnerEntity = {
  id: string;
  kind: "partner";
  name: string;
  cat: string;
  active: boolean;
  siren: string;
  antenne: string;
  address: string;
  creneaux: Creneaux;
  denrees: DenreeFlags;
  conditionnement: string;
  access: AccessFlags;
  accessNote: string;
  slotDisplay?: string;
  volumeRange?: string;
  partnerComment?: string;
  passage?: Passage;
  logoUrl?: string | null;
  dureeCollecte?: number;
  benevoleOnly?: boolean;
  activityStatus?: string;
  cerfaFrequency?: CerfaFrequency;
  history: HistoryEntry[];
  contacts: Contact[];
  portalEmail?: string;
  linkedSites?: string[];
  sirenInfo?: SirenInfo | null;
};

type BeneficiaireEntity = {
  id: string;
  kind: "beneficiaire";
  name: string;
  cat: string;
  pinned?: boolean;
  logoUrl?: string | null;
  active: boolean;
  address: string;
  tel: string;
  mail: string;
  access: AccessFlags;
  accessNote: string;
  horaires: string;
  hours: Record<string, Hours>;
  volumesAcceptes: string;
  equipement: { cuisine: boolean; frigo: boolean; chambreFroide: boolean; stockage: boolean; porc: boolean };
  stockageM2: number;
  denrees: DenreeFlags;
  contacts: Contact[];
  siren: string;
  sirenInfo?: SirenInfo | null;
  comment: string;
  structureType: string;
  statut: string;
  publicCibles: Record<string, boolean>;
  beneficiaryCount: string;
  addressVerified: boolean;
  network: string;
  description: string;
  isLinkeeSite: boolean;
  portalEmail?: string;
  creneaux: Creneaux;
};

type Entity = PartnerEntity | BeneficiaireEntity;

// Les 5 premières sont les catégories "officielles" utilisées pour le bilan RSE (collectes, planning) ;
// les suivantes sont des indications supplémentaires sur ce que le partenaire donne, sans impact sur le bilan RSE.
const DENREE_OPTIONS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie", "Produits surgelés", "Boissons", "Non alimentaire"];
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

const NO_DENREES: DenreeFlags = { Secs: false, "Fruits et légumes": false, "Produits frais": false, "Plats préparés": false, Boulangerie: false };
const NO_ACCESS: AccessFlags = { digicode: false, quai: false, camion: false, etage: false, horaire: false };

const BLANK_PARTNER: Omit<PartnerEntity, "id"> = {
  kind: "partner", name: "Nouveau partenaire", cat: "Commerce", active: true, siren: "", antenne: "Lyon", address: "", creneaux: {},
  denrees: NO_DENREES, conditionnement: "Carton", access: NO_ACCESS, accessNote: "", history: [], contacts: [], benevoleOnly: false, activityStatus: "Non défini",
};
const ACTIVITY_STATUS_OPTIONS = ["Non défini", "Dons réguliers", "Ponctuel", "Link citoyen"];
const STRUCTURE_TYPE_OPTIONS = [
  "Association de taille standard", "Association de petite taille / locale", "Epicerie Solidaire",
  "Distribution de repas", "CHU (centre d’hébergement d’urgence)", "Résidence Sociale", "Association organisant des maraudes",
];
const STATUT_OPTIONS = ["Actif - Distributions régulières", "Actif - Distributions non-régulières", "Échanges en cours / Pas de convention signée", "À contacter"];
const DEFAULT_PUBLIC_OPTIONS = ["Tout public", "Familles précaires", "SDF", "Etudiants précaires", "Jeunes précaires", "Femmes isolées"];
const BENEFICIARY_COUNT_OPTIONS = ["Moins de 50", "Entre 50 et 75", "Entre 75 et 100", "Entre 100 et 150", "Entre 150 et 200", "Plus de 200"];
const BLANK_BENEFICIAIRE: Omit<BeneficiaireEntity, "id"> = {
  kind: "beneficiaire", name: "Nouveau bénéficiaire", cat: "Association partenaire", pinned: false, active: true, address: "", tel: "", mail: "",
  access: NO_ACCESS, accessNote: "", horaires: "", hours: {}, volumesAcceptes: "", equipement: { cuisine: false, frigo: false, chambreFroide: false, stockage: false, porc: false },
  stockageM2: 0, denrees: NO_DENREES, contacts: [], siren: "",
  comment: "", structureType: "", statut: "", publicCibles: {}, beneficiaryCount: "",
  addressVerified: false, network: "", description: "", isLinkeeSite: false, creneaux: {},
};

// The full "fiche" lives in a jsonb column; name / category / address / active / benevole_only are also real columns.
type Row = { id: string; name: string; category: string | null; address: string | null; active: boolean; fiche: Record<string, unknown> | null; logo_url?: string | null; benevole_only?: boolean };
function rowToEntity(kind: "partner" | "beneficiaire", r: Row): Entity {
  const base = kind === "partner" ? BLANK_PARTNER : BLANK_BENEFICIAIRE;
  const e = { ...base, ...(r.fiche ?? {}), id: r.id, kind, name: r.name, cat: r.category ?? base.cat, address: r.address ?? "", active: r.active, logoUrl: r.logo_url ?? null } as Entity;
  if (e.kind === "beneficiaire") e.pinned = !!e.pinned || e.cat === "Distribution Linkee"; // the category is what makes a place a Linkee distribution
  if (e.kind === "partner") e.benevoleOnly = !!r.benevole_only;
  return e;
}
function entityToRow(e: Entity) {
  const { id, kind, name, cat, address, active, logoUrl, ...rest } = e;
  const fiche = { ...rest } as Record<string, unknown>;
  delete fiche.benevoleOnly;
  void id;
  void logoUrl; // stored in its own column
  const row: Record<string, unknown> = { name, category: cat, address, active, fiche };
  if (kind === "partner") row.benevole_only = !!(rest as { benevoleOnly?: boolean }).benevoleOnly;
  return row;
}

/** Blue badge shown next to the name of a place where Linkee runs a distribution. */
export function DistribBadge() {
  return (
    <span title="Lieu de distribution Linkee" className="inline-flex flex-none items-center gap-1.5 rounded-[40px] bg-[#2a78d6] px-3 py-1.5 text-[12px] font-semibold text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
        <path d="M5 9 H19 L17.5 19 H6.5 Z M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" />
      </svg>
      Distribution Linkee
    </span>
  );
}

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

/** Créneaux de collecte structurés (jour + début + fin), plusieurs par jour possibles — remplace le champ
 * "Créneau de collecte" en texte libre pour que le planning puisse s'en servir. */
function SlotsEditor({ value, onChange }: { value: Creneaux; onChange: (v: Creneaux) => void }) {
  function addSlot(day: string) {
    const cur = value[day] ?? [];
    onChange({ ...value, [day]: [...cur, { open: "09:00", close: "10:00" }] });
  }
  function updateSlot(day: string, i: number, patch: Partial<CreneauSlot>) {
    const cur = (value[day] ?? []).map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange({ ...value, [day]: cur });
  }
  function removeSlot(day: string, i: number) {
    const cur = (value[day] ?? []).filter((_, idx) => idx !== i);
    onChange({ ...value, [day]: cur });
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-[14px] border border-[var(--border)]">
      {DAYS.map((d) => {
        const slots = value[d.k] ?? [];
        return (
          <div key={d.k} className="border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-[var(--navy)]">{d.l}</span>
              <button type="button" onClick={() => addSlot(d.k)} className="flex-none rounded-[40px] border-[1.5px] border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                + Créneau
              </button>
            </div>
            {slots.length === 0 ? (
              <p className="mt-1 text-[11px] text-[var(--muted)]">Fermé / aucun créneau</p>
            ) : (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {slots.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input type="time" className={`${inputCls} !w-auto !px-2 !py-1.5 !text-xs`} value={s.open} onChange={(e) => updateSlot(d.k, i, { open: e.target.value })} />
                    <span className="text-[11px] text-[var(--muted)]">à</span>
                    <input type="time" className={`${inputCls} !w-auto !px-2 !py-1.5 !text-xs`} value={s.close} onChange={(e) => updateSlot(d.k, i, { close: e.target.value })} />
                    <select
                      className={`${inputCls} !w-auto !px-2 !py-1.5 !text-xs`}
                      value={s.weekParity ?? "toutes"}
                      onChange={(e) => updateSlot(d.k, i, { weekParity: e.target.value === "toutes" ? undefined : (e.target.value as "even" | "odd") })}
                    >
                      <option value="toutes">Toutes les semaines</option>
                      <option value="even">Une semaine sur deux — semaines paires</option>
                      <option value="odd">Une semaine sur deux — semaines impaires</option>
                    </select>
                    <button type="button" onClick={() => removeSlot(d.k, i)} title="Supprimer ce créneau" className="ml-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Cases à cocher extensibles : la liste d'options proposées est l'union des options par défaut et de toutes
 * les clés déjà utilisées par les autres bénéficiaires (+ ajout à la volée, immédiatement proposé partout). */
function ExtensibleChips({ options, selected, onToggle, onAdd }: { options: string[]; selected: Record<string, boolean>; onToggle: (k: string) => void; onAdd: (k: string) => void }) {
  const [adding, setAdding] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((k) => (
        <label
          key={k}
          className={`inline-flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3.5 py-2 text-xs font-semibold ${
            selected[k] ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
          }`}
        >
          <input type="checkbox" checked={!!selected[k]} onChange={() => onToggle(k)} className="hidden" />
          {selected[k] && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M20 6 L9 17 L4 12" />
            </svg>
          )}
          <span>{k}</span>
        </label>
      ))}
      <input
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !adding.trim()) return;
          onAdd(adding.trim());
          setAdding("");
        }}
        placeholder="+ Ajouter une catégorie…"
        className="w-[170px] rounded-[40px] border-[1.5px] border-dashed border-[var(--border)] bg-transparent px-3.5 py-2 text-xs font-semibold text-[var(--slate)] outline-none focus:border-[var(--turquoise)]"
      />
    </div>
  );
}

/** Choix unique présenté comme des puces (une seule tranche à la fois). */
function SingleChoiceChips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? "" : o)}
          className={`rounded-[40px] border-[1.5px] px-3.5 py-2 text-xs font-semibold ${
            value === o ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// Consultation seule (Responsable d'antenne) : le contenu de chaque section est désactivé, mais les sections restent dépliables.
const ReadOnlyCtx = createContext(false);

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
  const readOnly = useContext(ReadOnlyCtx);
  return (
    <div className="mb-2.5 overflow-hidden rounded-[14px] border border-[var(--border)]" style={{ borderTop: `4px solid ${SECTION_COLOR[sectionKey] ?? "var(--turquoise)"}` }}>
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center justify-between bg-[var(--input-bg)] px-4 py-[13px] text-left"
      >
        <h4 className="text-[14.5px] font-semibold text-[var(--navy)]">{title}</h4>
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
      {open && (
        <div className="border-t border-[var(--border)] p-4">
          <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">{children}</fieldset>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-[5px] block text-[11.5px] font-semibold tracking-[0.02em] text-[var(--slate)]";

export default function PartenairesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [partners, setPartners] = useState<PartnerEntity[]>([]);
  const [beneficiaires, setBeneficiaires] = useState<BeneficiaireEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const { cityId, role } = useCity(); // the page remounts when the city changes
  const readOnly = !canAdminCity(role); // filet de sécurité : consultation seule pour tout rôle qui ne pilote pas sa ville (voir ReadOnlyCtx)
  const saveTimers = useRef<Record<string, number>>({});
  const [tab, setTab] = useState<"partner" | "beneficiaire">("partner");
  const [ficheTab, setFicheTab] = useState<FicheTab>("fiche");
  const [currentId, setCurrentId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "actif" | "inactif">("actif"); // par défaut : seulement les actifs (les inactifs se retrouvent via le filtre)
  const [catFilter, setCatFilter] = useState(""); // bénéficiaires : typologie
  const [sortBy, setSortBy] = useState<"nom" | "statut" | "typologie">("nom");
  const [deleteTarget, setDeleteTarget] = useState<Entity | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["identite"]));
  useEffect(() => setFicheTab("fiche"), [currentId]);
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

  const SELECT_COLS = "id,name,category,address,active,fiche";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // only the selected city's partners and beneficiaries (see the city selector in the menu)
      const [ps, bs] = await Promise.all([
        supabase.from("partners").select(SELECT_COLS + ",logo_url,benevole_only").eq("city_id", cityId ?? "").is("deleted_at", null).order("name"),
        supabase.from("beneficiaries").select(SELECT_COLS).eq("city_id", cityId ?? "").is("deleted_at", null).order("name"),
      ]);
      if (cancelled) return;
      const p = ((ps.data ?? []) as unknown as Row[]).map((r) => rowToEntity("partner", r) as PartnerEntity);
      const b = ((bs.data ?? []) as Row[]).map((r) => rowToEntity("beneficiaire", r) as BeneficiaireEntity);
      setPartners(p);
      setBeneficiaires(b);
      const firstP = p.find((x) => x.active) ?? p[0];
      if (firstP) setCurrentId(firstP.id);
      if (ps.error || bs.error) showToast("Chargement impossible : " + (ps.error ?? bs.error)!.message);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Debounced write of one fiche to Supabase.
  function persist(e: Entity) {
    if (readOnly) return;
    const table = e.kind === "partner" ? "partners" : "beneficiaries";
    window.clearTimeout(saveTimers.current[e.id]);
    saveTimers.current[e.id] = window.setTimeout(async () => {
      const { error } = await supabase.from(table).update(entityToRow(e)).eq("id", e.id);
      if (error) showToast("Échec de l'enregistrement : " + error.message);
      else flashAutosave();
    }, 700);
  }

  const logoInput = useRef<HTMLInputElement>(null);
  const ficheRef = useRef<HTMLDivElement>(null);
  async function uploadLogo(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (readOnly || !file || !current || current.kind !== "partner") return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return showToast("Choisis une image de 2 Mo maximum.");
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${current.id}/logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: true });
    if (up.error) return showToast("Import impossible : " + up.error.message);
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("partners").update({ logo_url: url }).eq("id", current.id);
    if (error) return showToast("Logo non enregistré : " + error.message);
    setPartners((prev) => prev.map((p) => (p.id === current.id ? { ...p, logoUrl: url } : p)));
    showToast("Logo enregistré — il apparaît partout, y compris dans l'espace du partenaire.");
  }

  /** Suppression logique (deleted_at) : ne casse pas l'historique des collectes/distributions déjà liées, et
   * l'élément disparaît de toutes les listes et sélecteurs (qui filtrent tous deleted_at is null). */
  async function confirmDelete() {
    if (!deleteTarget || readOnly) return;
    setDeleting(true);
    const table = deleteTarget.kind === "partner" ? "partners" : "beneficiaries";
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { showToast("Suppression impossible : " + error.message); return; }
    if (deleteTarget.kind === "partner") setPartners((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    else setBeneficiaires((prev) => prev.filter((b) => b.id !== deleteTarget.id));
    if (currentId === deleteTarget.id) {
      const remaining = (deleteTarget.kind === "partner" ? partners : beneficiaires).filter((e) => e.id !== deleteTarget.id);
      setCurrentId(remaining[0]?.id ?? "");
    }
    showToast(`« ${deleteTarget.name} » supprimé.`);
    setDeleteTarget(null);
  }

  async function createEntity() {
    if (readOnly) return;
    if (!cityId) return showToast("Aucune ville n'est associée à ton compte.");
    const kind = tab;
    const table = kind === "partner" ? "partners" : "beneficiaries";
    const blank = (kind === "partner" ? BLANK_PARTNER : BLANK_BENEFICIAIRE) as Entity;
    const { data, error } = await supabase
      .from(table)
      .insert({ city_id: cityId, ...entityToRow(blank) })
      .select(SELECT_COLS)
      .single();
    if (error || !data) return showToast("Création impossible : " + (error?.message ?? "erreur inconnue"));
    const created = rowToEntity(kind, data as Row);
    if (kind === "partner") setPartners((prev) => [...prev, created as PartnerEntity]);
    else setBeneficiaires((prev) => [...prev, created as BeneficiaireEntity]);
    setSearch("");
    setCurrentId(created.id);
    setOpenSections(new Set(["identite"]));
    showToast("Fiche créée — renseigne le nom et les informations ci-dessous.");
  }

  function updatePartner(id: string, updater: (p: PartnerEntity) => PartnerEntity) {
    const current = partners.find((p) => p.id === id);
    if (!current) return;
    const next = updater(current);
    setPartners((prev) => prev.map((p) => (p.id === id ? next : p)));
    persist(next);
  }
  function updateBeneficiaire(id: string, updater: (b: BeneficiaireEntity) => BeneficiaireEntity) {
    const current = beneficiaires.find((b) => b.id === id);
    if (!current) return;
    const next = updater(current);
    setBeneficiaires((prev) => prev.map((b) => (b.id === id ? next : b)));
    persist(next);
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
    const nextList = next === "partner" ? partners : beneficiaires;
    const firstId = (nextList.find((e) => e.active) ?? nextList[0])?.id;
    if (firstId) setCurrentId(firstId);
    setStatusFilter("");
    setCatFilter("");
    setSortBy("nom");
    setOpenSections(new Set(["identite"]));
  }

  const catOptions = Array.from(new Set(beneficiaires.map((b) => b.cat).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const sortKey = (e: Entity) => (sortBy === "statut" ? (e.kind === "partner" ? e.activityStatus || "" : "") : sortBy === "typologie" ? e.cat || "" : "");
  const filteredList = list
    .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    // la fiche ouverte reste dans la liste même si on vient de la passer inactive (sinon elle disparaîtrait sous les yeux)
    .filter((e) => e.id === currentId || !activeFilter || (activeFilter === "actif" ? e.active : !e.active))
    .filter((e) => !statusFilter || (e.kind === "partner" && (e.activityStatus || "Non défini") === statusFilter))
    .filter((e) => !catFilter || (e.kind === "beneficiaire" && e.cat === catFilter))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.name.localeCompare(b.name));
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
          className="flex h-[38px] w-[38px] flex-none items-center justify-center overflow-hidden rounded-full font-display text-sm font-bold text-white"
          style={{ background: e.logoUrl ? "var(--card)" : colorFor(e.name) }}
        >
          {e.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(e.name)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-[var(--navy)]">{e.name}</div>
          <div className="truncate text-[11px] text-[var(--slate)]">
            {e.cat}
            {e.kind === "partner" && e.activityStatus && e.activityStatus !== "Non défini" ? ` · ${e.activityStatus}` : ""}
          </div>
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          {e.kind === "beneficiaire" && e.pinned && (
            <span className="rounded-[40px] bg-[#2a78d6] px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">Linkee</span>
          )}
          <span className={`h-2 w-2 rounded-full ${e.active ? "bg-[var(--good)]" : "bg-[var(--muted)]"}`} />
        </span>
        {!readOnly && (
          <button
            type="button"
            title="Supprimer"
            onClick={(ev) => {
              ev.stopPropagation();
              setDeleteTarget(e);
            }}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
              <path d="M4 7 H20 M9 7 V4.5 A1 1 0 0 1 10 3.5 H14 A1 1 0 0 1 15 4.5 V7 M6.5 7 L7.3 19.5 A2 2 0 0 0 9.3 21.4 H14.7 A2 2 0 0 0 16.7 19.5 L17.5 7" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <ReadOnlyCtx.Provider value={readOnly}>
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">{tab === "partner" ? "Partenaires" : "Bénéficiaires"}</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">
        {tab === "partner"
          ? readOnly ? "Fiches d'identité des commerces qui donnent leurs invendus — en consultation." : "Fiches d'identité des commerces qui donnent leurs invendus — modifiables directement ici."
          : "Fiches des associations et points de distribution qui reçoivent les denrées."}
      </p>
      {readOnly && (
        <p className="mb-3.5 rounded-xl bg-[var(--track)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--slate)]">Consultation seule : tu vois les fiches de ta ville. Pour une modification, contacte le Superadmin.</p>
      )}

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
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-[9px] text-[12.5px] font-semibold text-[var(--slate)]">
          <option value="actif">Actifs seulement</option>
          <option value="inactif">Inactifs seulement</option>
          <option value="">Actifs et inactifs</option>
        </select>
        {tab === "partner" ? (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-[9px] text-[12.5px] font-semibold text-[var(--slate)]">
            <option value="">Tous statuts</option>
            {ACTIVITY_STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : (
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-[9px] text-[12.5px] font-semibold text-[var(--slate)]">
            <option value="">Toutes typologies</option>
            {catOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-[9px] text-[12.5px] font-semibold text-[var(--slate)]">
          <option value="nom">Trier par nom</option>
          {tab === "partner" ? <option value="statut">Trier par statut</option> : <option value="typologie">Trier par typologie</option>}
        </select>
        {!readOnly && (
          <button
            type="button"
            onClick={createEntity}
            className="ml-auto flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
              <path d="M12 5 V19 M5 12 H19" />
            </svg>
            <span>{tab === "partner" ? "Ajouter un partenaire" : "Ajouter un bénéficiaire"}</span>
          </button>
        )}
      </div>

      {tab === "partner" && !loading && (
        <PartnerMap
          key={cityId ?? "none"}
          items={partners.map((p) => ({ id: p.id, name: p.name, cat: p.cat, address: p.address, active: p.active, activityStatus: p.activityStatus, denrees: p.denrees, creneaux: p.creneaux }))}
          selectedId={currentId}
          onSelect={(id) => {
            setCurrentId(id);
            window.setTimeout(() => ficheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          }}
        />
      )}

      {tab === "beneficiaire" && !loading && (
        <BeneficiaryMap
          key={cityId ?? "none"}
          items={beneficiaires.map((b) => ({ id: b.id, name: b.name, cat: b.cat, address: b.address, active: b.active, pinned: b.pinned, horaires: b.horaires, hours: b.hours, denrees: b.denrees, equipement: b.equipement }))}
          selectedId={currentId}
          onSelect={(id) => {
            setCurrentId(id);
            window.setTimeout(() => ficheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          }}
        />
      )}

      <div className="mt-[18px] grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[330px_1fr]">
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[var(--shadow)]">
          {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
          {!loading && filteredList.length === 0 && (
            <p className="p-4 text-[13px] text-[var(--slate)]">
              {list.length === 0 ? "Aucune fiche pour l'instant — clique sur « Ajouter » pour créer la première." : "Aucun résultat."}
            </p>
          )}
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

        <div ref={ficheRef} className="scroll-mt-4 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-7 pt-[26px] pb-[30px] shadow-[var(--shadow)]">
          {!current ? (
            <div className="flex flex-col items-center gap-2.5 py-[60px] text-center text-[var(--slate)]">
              <p>Sélectionnez une fiche dans la liste.</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-start gap-[18px]">
                <div
                  onClick={() => (readOnly ? undefined : current.kind === "partner" ? logoInput.current?.click() : showToast("Le logo est disponible pour les partenaires."))}
                  className={`group relative flex h-[66px] w-[66px] flex-none items-center justify-center overflow-hidden rounded-[20px] font-display text-[22px] font-extrabold text-white ${readOnly ? "" : "cursor-pointer"}`}
                  style={{ background: current.logoUrl ? "var(--card)" : colorFor(current.name) }}
                  title={readOnly ? undefined : "Changer le logo"}
                >
                  <input ref={logoInput} type="file" accept="image/*" hidden onChange={uploadLogo} />
                  {current.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(current.name)
                  )}
                  <span className={`absolute inset-0 items-center justify-center rounded-[20px] bg-[rgba(0,22,65,0.55)] opacity-0 transition-opacity group-hover:opacity-100 ${readOnly ? "hidden" : "flex"}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] text-white">
                      <path d="M4 8 L7 4 H17 L20 8" />
                      <rect x="3" y="8" width="18" height="12" rx="2" />
                      <circle cx="12" cy="14" r="3.2" />
                    </svg>
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <input
                      value={current.name}
                      readOnly={readOnly}
                      onChange={(e) => updateEntity((entity) => ({ ...entity, name: e.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border-b-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-display text-[27px] font-black text-[var(--navy)] outline-none hover:border-b-[var(--turquoise)] hover:bg-[var(--input-bg)] focus:border-b-[var(--turquoise)] focus:bg-[var(--input-bg)]"
                    />
                    {current.kind === "beneficiaire" && current.pinned && <DistribBadge />}
                    {!readOnly && (
                      <button
                        type="button"
                        title="Supprimer cette fiche"
                        onClick={() => setDeleteTarget(current)}
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
                          <path d="M4 7 H20 M9 7 V4.5 A1 1 0 0 1 10 3.5 H14 A1 1 0 0 1 15 4.5 V7 M6.5 7 L7.3 19.5 A2 2 0 0 0 9.3 21.4 H14.7 A2 2 0 0 0 16.7 19.5 L17.5 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <select
                      value={current.cat}
                      disabled={readOnly}
                      onChange={(e) => updateEntity((entity) => ({ ...entity, cat: e.target.value, ...(entity.kind === "beneficiaire" ? { pinned: e.target.value === "Distribution Linkee" } : {}) }))}
                      className="cursor-pointer rounded-[40px] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-[5px] text-[12.5px] font-semibold text-[var(--slate)]"
                    >
                      {(current.kind === "partner"
                        ? ["Boulangerie", "Supermarché", "Traiteur", "Hôtel", "Restauration rapide", "Restauration collective", "Restauration collective Standard", "Traiteur, hôtel et restauration rapide", "Industriel", "Grossiste", "Association", "Evenementiel", "Non alimentaire"]
                        : ["Distribution Linkee", "Association partenaire"]
                      ).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--slate)]">
                    {current.active ? "Actif — visible dans l'app du logisticien" : "Inactif — masqué de l'app du logisticien"}
                  </span>
                  <button
                    type="button"
                    disabled={readOnly}
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
              {current.kind === "partner" && (
                <label className="mb-4 flex items-start gap-2.5 rounded-[14px] border-[1.5px] p-3" style={{ borderColor: current.benevoleOnly ? "#eb6834" : "var(--border)", background: current.benevoleOnly ? "rgba(235,104,52,.08)" : "var(--card)" }}>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={!!current.benevoleOnly}
                    onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, benevoleOnly: e.target.checked } : entity))}
                    className="mt-0.5 h-[17px] w-[17px] accent-[#eb6834]"
                  />
                  <span>
                    <span className="flex items-center gap-2 text-[13px] font-bold text-[var(--navy)]">Éligible collecte bénévole <BetaBadge label="Bêta test" /></span>
                    <span className="block text-[11.5px] leading-[1.4] text-[var(--slate)]">
                      Ce partenaire sort du planning pro classique et n&apos;a plus accès à la collecte exceptionnelle classique — il passe par les Links Bénévoles (ou une collecte « pro » planifiée, relabellisée pour lui). Pense aussi à activer 🎒 et/ou 🚗 dans Links Bénévoles.
                    </span>
                  </span>
                </label>
              )}
              <div className={`mb-4 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${autosaveVisible ? "opacity-100" : "opacity-0"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                  <path d="M20 6 L9 17 L4 12" />
                </svg>
                Modifications enregistrées
              </div>

              <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-1.5 sm:grid-cols-4">
                {(current.kind === "partner" ? FICHE_TABS : BENEFICIAIRE_FICHE_TABS).filter((t) => !(readOnly && t.k === "valorisation")).map((t) => {
                  const on = ficheTab === t.k;
                  return (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => setFicheTab(t.k)}
                      className={`flex min-w-0 items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 transition-colors ${on ? "" : "hover:bg-[var(--input-bg)]"}`}
                      style={on ? { background: t.color, color: t.fg } : { color: "var(--navy)" }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none" style={on ? undefined : { color: t.color === "#0a1a3f" ? "var(--slate)" : t.color }}>
                        {t.icon}
                      </svg>
                      <span className="truncate text-[13.5px] font-semibold">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <div>
              {current.kind === "partner" && ficheTab === "documents" && <PartnerDocuments key={current.id} partnerId={current.id} role="admin" readOnly={readOnly} />}
              {current.kind === "beneficiaire" && ficheTab === "documents" && <PartnerDocuments key={current.id} beneficiaryId={current.id} role="admin" readOnly={readOnly} />}
              {current.kind === "partner" && ficheTab === "valorisation" && !readOnly && <PartnerValuation key={current.id} partnerId={current.id} category={current.cat} />}
              {current.kind === "partner" && ficheTab === "collectes" && <PartnerCollectes key={current.id} partnerId={current.id} cityId={cityId} category={current.cat} readOnly={readOnly} />}

              {ficheTab === "fiche" && (
              <>
              <AccordionSection title="Adresse & accès" sectionKey="identite" open={openSections.has("identite")} onToggle={toggleSection}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Adresse</label>
                    <AddressSearch
                      className={inputCls}
                      value={current.address}
                      onChange={(v) => updateEntity((entity) => ({ ...entity, address: v }))}
                      onPick={(hit) => updateEntity((entity) => ({ ...entity, address: hit.label }))}
                      placeholder="Numéro, rue, code postal, ville"
                    />
                    <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">Choisis une suggestion dans la liste pour garantir un matching fiable avec les Links Bénévoles.</p>
                  </div>
                  <div>
                    <label className={labelCls}>Numéro SIREN</label>
                    <SirenField
                      siren={current.siren}
                      info={current.sirenInfo}
                      onSirenChange={(v) => updateEntity((entity) => ({ ...entity, siren: v }))}
                      onInfoChange={(info) => updateEntity((entity) => ({ ...entity, sirenInfo: info }))}
                    />
                  </div>
                  {current.kind === "partner" && (
                    <div>
                      <label className={labelCls}>Antenne</label>
                      <input className={inputCls} value={current.antenne} onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, antenne: e.target.value } : entity))} />
                    </div>
                  )}
                  {current.kind === "partner" && (
                    <div>
                      <label className={labelCls}>Statut d&apos;activité <span className="font-normal text-[var(--muted)]">(filtrable/triable dans la liste)</span></label>
                      <select className={inputCls} value={current.activityStatus || "Non défini"} onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, activityStatus: e.target.value } : entity))}>
                        {ACTIVITY_STATUS_OPTIONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {current.kind === "partner" && (
                    <div>
                      <label className={labelCls}>Fréquence d&apos;émission Cerfa <span className="font-normal text-[var(--muted)]">(sert uniquement aux alertes de retard)</span></label>
                      <select className={inputCls} value={current.cerfaFrequency || "ponctuel"} onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, cerfaFrequency: e.target.value as CerfaFrequency } : entity))}>
                        {CERFA_FREQUENCIES.map((f) => (
                          <option key={f.k} value={f.k}>{f.l}</option>
                        ))}
                      </select>
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
                  {current.kind === "beneficiaire" && (
                    <div className="sm:col-span-2">
                      <label className={labelCls}>
                        Créneau de livraison fixe <span className="font-normal text-[var(--muted)]">(pour les associations livrées chaque semaine par le planning pro)</span>
                      </label>
                      <p className="mb-2 text-[11.5px] text-[var(--slate)]">
                        Renseigne un jour + une plage horaire pour que cette association apparaisse automatiquement dans le Planning ce jour-là, sans avoir à l&apos;ajouter à la main chaque semaine.
                        Ne sert qu&apos;au planning pro — sans effet sur Links Bénévoles, qui se base sur les horaires d&apos;ouverture ci-dessous.
                      </p>
                      {formatCreneaux(current.creneaux) && <p className="mb-2 text-[12px] font-semibold text-[var(--navy)]">{formatCreneaux(current.creneaux)}</p>}
                      <SlotsEditor
                        value={current.creneaux ?? {}}
                        onChange={(v) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, creneaux: v } : entity))}
                      />
                    </div>
                  )}
                </div>
              </AccordionSection>

              {current.kind === "partner" && (
                <AccordionSection title="Créneaux de collecte" sectionKey="creneaux" open={openSections.has("creneaux")} onToggle={toggleSection}>
                  <p className="mb-3 text-[11.5px] text-[var(--slate)]">
                    Jour + heure de début + heure de fin — utilisés pour planifier les collectes. Plusieurs créneaux possibles, y compris plusieurs le même jour.
                  </p>
                  {formatCreneaux(current.creneaux) && <p className="mb-3 text-[12px] font-semibold text-[var(--navy)]">{formatCreneaux(current.creneaux)}</p>}
                  <SlotsEditor
                    value={current.creneaux ?? {}}
                    onChange={(v) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, creneaux: v } : entity))}
                  />
                </AccordionSection>
              )}

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
                <AccordionSection title="Checklist de passage" sectionKey="passage" open={openSections.has("passage")} onToggle={toggleSection}>
                  <p className="mb-3 text-[11.5px] text-[var(--slate)]">
                    Ce qui est coché apparaît dans la checklist d&apos;Akram les jours où ce partenaire est au planning, et sous forme d&apos;icône après son nom dans le Planning.
                  </p>
                  <div className="flex flex-col">
                    {PASSAGE_ITEMS.map((it) => {
                      const on = !!current.passage?.[it.k];
                      return (
                        <div key={it.k} className="border-t border-[var(--border)] py-3 first:border-t-0">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full" style={{ background: it.bg, color: it.fg }}>
                              <PassageIcon k={it.k} size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-bold text-[var(--navy)]">{it.label}</span>
                              <span className="block text-[11.5px] text-[var(--slate)]">{it.hint}</span>
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={it.label}
                              onClick={() => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, passage: { ...entity.passage, [it.k]: !on } } : entity))}
                              className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${on ? "bg-[var(--good)]" : "bg-[var(--border)]"}`}
                            >
                              <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-[2px]"}`} />
                            </button>
                          </div>
                          {it.k === "rotation" && on && (
                            <input
                              className={`${inputCls} mt-2.5`}
                              placeholder="Commentaire : ex. 3 bacs gris à rendre, en récupérer 3 propres au comptoir"
                              value={current.passage?.rotationNote ?? ""}
                              onChange={(e) => updateEntity((entity) => (entity.kind === "partner" ? { ...entity, passage: { ...entity.passage, rotationNote: e.target.value } } : entity))}
                            />
                          )}
                        </div>
                      );
                    })}
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
                <AccordionSection title="Horaires d'ouverture et équipements sur site" sectionKey="accueil" open={openSections.has("accueil")} onToggle={toggleSection}>
                  <div className="mb-3.5">
                    <label className={labelCls}>
                      Horaires d&apos;ouverture <span className="font-normal text-[var(--muted)]">(utilisés pour trouver l&apos;association la plus proche ouverte, dans Links Bénévoles)</span>
                    </label>
                    <div className="flex flex-col overflow-hidden rounded-[14px] border border-[var(--border)]">
                      {DAYS.map((d) => {
                        const h = current.hours?.[d.k] ?? null;
                        const setH = (v: Hours) =>
                          updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, hours: { ...(entity.hours ?? {}), [d.k]: v } } : entity));
                        return (
                          <div key={d.k} className="grid grid-cols-[70px_auto_1fr_1fr] items-center gap-2.5 bg-[var(--card)] px-3 py-2 border-b border-[var(--border)] last:border-b-0 sm:grid-cols-[90px_auto_1fr_1fr]">
                            <span className="text-[12.5px] font-bold text-[var(--navy)]">{d.l}</span>
                            <label className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-[var(--slate)]">
                              <input type="checkbox" checked={!h} onChange={(e) => setH(e.target.checked ? null : { open: "09:00", close: "18:00" })} className="h-[15px] w-[15px] accent-[var(--critical)]" />
                              Fermé
                            </label>
                            <input type="time" disabled={!h} className={`${inputCls} !px-2 !py-1.5 !text-xs disabled:opacity-35`} value={h?.open ?? "09:00"} onChange={(e) => h && setH({ ...h, open: e.target.value })} />
                            <input type="time" disabled={!h} className={`${inputCls} !px-2 !py-1.5 !text-xs disabled:opacity-35`} value={h?.close ?? "18:00"} onChange={(e) => h && setH({ ...h, close: e.target.value })} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Note horaires (facultatif) <span className="font-normal text-[var(--muted)]">— fermetures exceptionnelles, précisions…</span></label>
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
                            ["stockage", "Stockage"],
                            ["porc", "Accepte le porc"],
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

              {current.kind === "beneficiaire" && (
                <AccordionSection title="Profil de l'association" sectionKey="profil" open={openSections.has("profil")} onToggle={toggleSection}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Type de structure</label>
                      <select className={inputCls} value={current.structureType} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, structureType: e.target.value } : entity))}>
                        <option value="">— Non renseigné —</option>
                        {STRUCTURE_TYPE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Statut</label>
                      <select className={inputCls} value={current.statut} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, statut: e.target.value } : entity))}>
                        <option value="">— Non renseigné —</option>
                        {STATUT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Public <span className="font-normal text-[var(--muted)]">(catégories de bénéficiaires accueillis)</span></label>
                      <ExtensibleChips
                        options={Array.from(new Set([...DEFAULT_PUBLIC_OPTIONS, ...Object.keys(current.publicCibles)]))}
                        selected={current.publicCibles}
                        onToggle={(k) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, publicCibles: { ...entity.publicCibles, [k]: !entity.publicCibles[k] } } : entity))}
                        onAdd={(k) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, publicCibles: { ...entity.publicCibles, [k]: true } } : entity))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Nombre de bénéficiaires</label>
                      <SingleChoiceChips options={BENEFICIARY_COUNT_OPTIONS} value={current.beneficiaryCount} onChange={(v) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, beneficiaryCount: v } : entity))} />
                    </div>
                    <div>
                      <label className={labelCls}>Réseau / fédération</label>
                      <input className={inputCls} placeholder="Ex : Habitat & Humanisme" value={current.network} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, network: e.target.value } : entity))} />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--navy)]">
                        <input type="checkbox" checked={current.addressVerified} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, addressVerified: e.target.checked } : entity))} className="h-[17px] w-[17px] accent-[var(--good)]" />
                        Adresse vérifiée
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Description</label>
                      <textarea className={`${inputCls} min-h-[64px] resize-y`} value={current.description} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, description: e.target.value } : entity))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Commentaires</label>
                      <textarea className={`${inputCls} min-h-[64px] resize-y`} value={current.comment} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, comment: e.target.value } : entity))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--navy)]">
                        <input type="checkbox" checked={current.isLinkeeSite} onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, isLinkeeSite: e.target.checked } : entity))} className="h-[17px] w-[17px] accent-[#2a78d6]" />
                        Site Linkee <span className="font-normal text-[var(--muted)]">(entrepôt ou local Linkee — pas une association externe)</span>
                      </label>
                    </div>
                  </div>
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

              {current.kind === "beneficiaire" && (
                <AccordionSection title="Accès espace bénéficiaire" sectionKey="portal" open={openSections.has("portal")} onToggle={toggleSection}>
                  <div>
                    <label className={labelCls}>Email de connexion à l&apos;espace bénéficiaire</label>
                    <input
                      className={inputCls}
                      placeholder="contact@association.fr"
                      value={current.portalEmail || ""}
                      onChange={(e) => updateEntity((entity) => (entity.kind === "beneficiaire" ? { ...entity, portalEmail: e.target.value } : entity))}
                    />
                    <p className="mt-2 text-[11.5px] text-[var(--slate)]">
                      Note libre — le compte lui-même se crée dans Comptes &amp; villes en rattachant l&apos;association à ce compte.
                    </p>
                  </div>
                </AccordionSection>
              )}
              </>
              )}
              </div>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[360px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">
          {toast}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(10,20,40,0.5)] px-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[380px] rounded-[20px] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
            <h3 className="mb-2 font-display text-[19px] font-black text-[var(--navy)]">Supprimer « {deleteTarget.name} » ?</h3>
            <p className="mb-5 text-[13.5px] text-[var(--slate)]">Cette action est définitive.</p>
            <div className="flex gap-2.5">
              <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="flex-1 rounded-[40px] border-[1.5px] border-[var(--border)] py-2.5 font-display text-[13.5px] font-bold text-[var(--slate)] disabled:opacity-60">
                Annuler
              </button>
              <button type="button" disabled={deleting} onClick={confirmDelete} className="flex-1 rounded-[40px] bg-[var(--critical)] py-2.5 font-display text-[13.5px] font-bold text-white disabled:opacity-60">
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ReadOnlyCtx.Provider>
  );
}
