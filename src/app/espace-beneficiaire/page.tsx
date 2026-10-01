"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PartnerDocuments from "@/components/partner/PartnerDocuments";
import { signedUrls } from "@/lib/photos";
import { CAT_KEYS, CAT_LABELS, buildEvo, isoOf, type CatKey } from "@/lib/stats";
import { CRENEAUX_DAYS, type Creneaux, type Slot as CreneauSlot } from "@/lib/creneaux";

type Contact = { type: string; nom: string; tel: string; mail: string };
type Hours = { open: string; close: string } | null;
type Fiche = Record<string, unknown>;
type BeneficiaryRow = { id: string; name: string; category: string | null; address: string | null; city_id: string; fiche: Fiche | null; logo_url: string | null };
type CollecteRow = {
  id: string;
  beneficiary_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  collecte_items: { denree: string | null; kg: number | string | null }[] | null;
  photo_paths: string[] | null;
};
const CAT_COLORS: Record<CatKey, string> = { secs: "var(--cat-1)", fl: "var(--cat-2)", frais: "var(--cat-3)", plats: "var(--cat-4)", boulang: "var(--cat-5)" };
const MONTHS_SHORT = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DENREE_TO_CAT: Partial<Record<string, CatKey>> = Object.fromEntries(CAT_KEYS.map((k) => [CAT_LABELS[k], k]));

const DAYS = [
  { k: "lun", l: "Lundi" }, { k: "mar", l: "Mardi" }, { k: "mer", l: "Mercredi" }, { k: "jeu", l: "Jeudi" },
  { k: "ven", l: "Vendredi" }, { k: "sam", l: "Samedi" }, { k: "dim", l: "Dimanche" },
];
const ACCESS_OPTIONS = [
  { k: "digicode", l: "Digicode" }, { k: "quai", l: "Quai de livraison" }, { k: "camion", l: "Accès camion" },
  { k: "etage", l: "Étage / ascenseur" }, { k: "horaire", l: "Horaire strict" },
];
const DENREE_OPTIONS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie", "Produits surgelés", "Boissons", "Non alimentaire"];

function fmtDateShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return { dow: d.toLocaleDateString("fr-FR", { weekday: "short" }), dom: d.getDate() };
}
function summarizeItems(items: { denree: string | null; kg: number | string | null }[] | null) {
  const arr = items ?? [];
  const denree = Array.from(new Set(arr.map((i) => i.denree).filter(Boolean))).join(", ") || "—";
  const kg = Math.round(arr.reduce((s, i) => s + (Number(i.kg) || 0), 0) * 10) / 10;
  return { denree, kg };
}

function Icon({ children, className = "h-4 w-4", sw = 1.8 }: { children: ReactNode; className?: string; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}
const PIN = <><path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></>;
const CAL = <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9.5 H20.5 M8 3 V6.5 M16 3 V6.5" /></>;
const STORE = <><path d="M4 8 L8 4 H16 L20 8" /><rect x="4" y="8" width="16" height="11" rx="1.5" /><path d="M4 8 H20" /></>;
const DOC = <><path d="M7 3 H14 L19 8 V21 H7 Z" /><path d="M14 3 V8 H19" /></>;
const CLOCK = <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5 V12 L15 14" /></>;
const PHONE = <><path d="M5 4.5 C5 4.5 7 4 8 6 C8.8 7.7 7.5 8.3 7.2 9 C6.8 10 9 14 11.5 15.5 C12 15.8 12.8 14.5 13.8 14.2 C15.5 13.8 16 16 16 16 C16 17 15.5 19.5 13.5 19.5 C9.5 19.5 5 15 5 11 C5 8.5 5 4.5 5 4.5 Z" /></>;
const CheckIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => <Icon className={className} sw={2.4}><path d="M20 6 L9 17 L4 12" /></Icon>;

function Wordmark() {
  return <span className="font-script text-[22px] leading-none text-[var(--panel-fg)]">linkee</span>;
}

function Card({ title, icon, note, children }: { title?: string; icon?: ReactNode; note?: string; children: ReactNode }) {
  return (
    <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-[22px] py-5 shadow-[var(--shadow)]">
      {title && (
        <h3 className="mb-[3px] flex items-center gap-2 font-display text-base font-extrabold">
          {icon && <Icon className="h-[17px] w-[17px] text-[var(--turquoise)]">{icon}</Icon>}
          {title}
        </h3>
      )}
      {note && <p className="mb-3.5 text-[11.5px] text-[var(--slate)]">{note}</p>}
      {children}
    </div>
  );
}

function CollectRow({ date, note, badge, badgeCls, photos }: { date: string; note: string; badge: string; badgeCls?: string; photos?: string[] }) {
  const d = fmtDateShort(date);
  return (
    <div className="flex items-center gap-3.5 border-b border-[var(--border)] py-3 last:border-b-0">
      <span className="w-16 flex-none text-center">
        <span className="block text-[10px] font-bold text-[var(--slate)] uppercase">{d.dow}</span>
        <span className="block font-display text-[22px] font-black">{d.dom}</span>
      </span>
      <span className="min-w-0 flex-1">
        <div className="text-[12.5px] text-[var(--slate)]">{note}</div>
      </span>
      {photos && photos.length > 0 && (
        <span className="flex flex-none -space-x-2">
          {photos.slice(0, 3).map((url, i) =>
            url ? (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="block h-9 w-9 overflow-hidden rounded-[10px] border-2 border-[var(--card)] shadow-[var(--shadow)]">
                <img src={url} alt="Photo de la dépose" className="h-full w-full object-cover" />
              </a>
            ) : null
          )}
        </span>
      )}
      <span className={`flex-none rounded-[40px] px-2.5 py-[5px] text-[10px] font-bold whitespace-nowrap uppercase ${badgeCls ?? "bg-[var(--track)] text-[var(--slate)]"}`}>{badge}</span>
    </div>
  );
}

type StaffContact = { full_name: string | null; phone: string | null } | null | undefined;

function ContactLine({ role, contact }: { role: string; contact: StaffContact }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[14px] border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3.5">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--navy-deep)] text-[var(--panel-fg)]"><Icon className="h-[18px] w-[18px]">{PHONE}</Icon></span>
      <span className="min-w-0 flex-1">
        <div className="text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{role}</div>
        {contact === undefined ? (
          <div className="mt-0.5 text-[12.5px] text-[var(--slate)]">Chargement…</div>
        ) : contact?.phone ? (
          <>
            <div className="text-[14px] font-bold text-[var(--navy)]">{contact.full_name || role}</div>
            <a href={`tel:${contact.phone}`} className="text-[13px] font-bold text-[var(--turquoise)]">{contact.phone}</a>
          </>
        ) : (
          <div className="mt-0.5 text-[12.5px] text-[var(--slate)]">Non renseigné pour l&apos;instant.</div>
        )}
      </span>
    </div>
  );
}

/** Onglet "Nous contacter" : coordonnées du Responsable d'antenne et du Logisticien de la ville de
 * l'association, via les mêmes fonctions techniques que côté partenaires (migrations 025 et 040). */
function ContactTab({ cityId }: { cityId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [antenne, setAntenne] = useState<StaffContact>(undefined);
  const [logisticien, setLogisticien] = useState<StaffContact>(undefined);
  useEffect(() => {
    if (!cityId) return;
    supabase.rpc("antenne_contact", { p_city_id: cityId }).then(({ data }) => setAntenne((data as StaffContact[] | null)?.[0] ?? null));
    supabase.rpc("logisticien_contact", { p_city_id: cityId }).then(({ data }) => setLogisticien((data as StaffContact[] | null)?.[0] ?? null));
  }, [supabase, cityId]);
  return (
    <Card title="Nous contacter" icon={PHONE} note="Pour toute question sur vos livraisons ou votre fiche.">
      <div className="flex flex-col gap-3">
        <ContactLine role="Responsable d'antenne" contact={antenne} />
        <ContactLine role="Logisticien" contact={logisticien} />
      </div>
    </Card>
  );
}

const fieldCls = "w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12.5px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

/** Créneaux de livraison fixe (en plus des horaires d'ouverture) : même éditeur jour × créneaux que côté
 * partenaire (admin), ici en self-service pour l'association. */
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
      {CRENEAUX_DAYS.map((d) => {
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
              <p className="mt-1 text-[11px] text-[var(--muted)]">Aucun créneau fixe</p>
            ) : (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {slots.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input type="time" className={`${fieldCls} !w-auto !px-2 !py-1.5 !text-xs`} value={s.open} onChange={(e) => updateSlot(d.k, i, { open: e.target.value })} />
                    <span className="text-[11px] text-[var(--muted)]">à</span>
                    <input type="time" className={`${fieldCls} !w-auto !px-2 !py-1.5 !text-xs`} value={s.close} onChange={(e) => updateSlot(d.k, i, { close: e.target.value })} />
                    <select
                      className={`${fieldCls} !w-auto !px-2 !py-1.5 !text-xs`}
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

/** Contacts de l'association, modifiables directement (comme côté partenaire). */
function ContactsEditor({ value, onChange }: { value: Contact[]; onChange: (v: Contact[]) => void }) {
  return (
    <div>
      <div className="mb-2.5 flex flex-col gap-2.5">
        {value.map((c, idx) => (
          <div key={idx} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[110px_1fr_1fr_1fr_30px]">
            <select className={fieldCls} value={c.type} onChange={(e) => onChange(value.map((row, i) => (i === idx ? { ...row, type: e.target.value } : row)))}>
              {["Admin", "Opérationnel", "Comptable"].map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className={fieldCls} placeholder="Nom" value={c.nom} onChange={(e) => onChange(value.map((row, i) => (i === idx ? { ...row, nom: e.target.value } : row)))} />
            <input className={fieldCls} placeholder="Téléphone" value={c.tel} onChange={(e) => onChange(value.map((row, i) => (i === idx ? { ...row, tel: e.target.value } : row)))} />
            <input className={fieldCls} placeholder="Email" value={c.mail} onChange={(e) => onChange(value.map((row, i) => (i === idx ? { ...row, mail: e.target.value } : row)))} />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
              className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...value, { type: "Opérationnel", nom: "", tel: "", mail: "" }])}
        className="w-full rounded-[11px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] py-2 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
      >
        + Ajouter un contact
      </button>
    </div>
  );
}

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-semibold ${on ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--muted)]"}`}>
      {on && <CheckIcon className="h-3 w-3" />}
      {label}
    </span>
  );
}

function GranToggle({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 flex w-fit rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px] shadow-[var(--shadow)]">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`rounded-[40px] px-4 py-2 font-display text-[12.5px] font-bold ${value === k ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-[18px] py-4 shadow-[var(--shadow)]">
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{label}</span>
      <span className="font-display text-[26px] font-black tabular-nums">{value}</span>
      {sub && <div className="mt-1 text-[11.5px] text-[var(--slate)]">{sub}</div>}
    </div>
  );
}

function EvoChart({ data }: { data: { l: string; v: number }[] }) {
  const W = 560, H = 200, padL = 40, padR = 10, padT = 10, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const niceMax = Math.ceil(Math.max(...data.map((p) => p.v)) / 100) * 100 || 100;
  const step = plotW / (data.length - 1 || 1);
  const pts = data.map((p, i) => ({ x: padL + i * step, y: padT + plotH - (p.v / niceMax) * plotH, l: p.l }));
  const line = "M " + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)},${padT + plotH} L ${pts[0].x.toFixed(1)},${padT + plotH} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <path d={area} fill="var(--turquoise)" opacity={0.12} />
      <path d={line} fill="none" stroke="var(--turquoise)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="var(--turquoise)" />
          {(i % Math.ceil(pts.length / 8 || 1) === 0 || i === pts.length - 1) && (
            <text x={p.x} y={H - 6} fontSize={9.5} textAnchor="middle" fill="var(--slate)">{p.l}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Statistiques des livraisons reçues par une association (poids, typologie), sans aucune valorisation —
 * équivalent du tableau de bord partenaire mais côté réception, cf. demande de Simon du 01/10/2026. */
function summarizeDropoffs(rows: CollecteRow[]) {
  let volume = 0;
  let ok = 0;
  let annulees = 0;
  const kgByCat: Record<CatKey, number> = { secs: 0, fl: 0, frais: 0, plats: 0, boulang: 0 };
  const byDay: Record<string, number> = {};
  for (const r of rows) {
    if (r.status === "annule") { annulees++; continue; }
    if (r.status !== "collecte") continue;
    ok++;
    let kg = 0;
    for (const it of r.collecte_items ?? []) {
      const v = Number(it.kg) || 0;
      kg += v;
      const key = it.denree ? DENREE_TO_CAT[it.denree] : undefined;
      if (key) kgByCat[key] += v;
    }
    volume += kg;
    byDay[r.scheduled_date] = (byDay[r.scheduled_date] ?? 0) + kg;
  }
  const totalCat = Object.values(kgByCat).reduce((a, b) => a + b, 0);
  return {
    volume: Math.round(volume * 10) / 10,
    ok,
    annulees,
    avg: ok ? Math.round((volume / ok) * 10) / 10 : 0,
    taux: ok + annulees ? Math.round((ok / (ok + annulees)) * 100) : 0,
    denrees: CAT_KEYS.map((k) => ({ k, kg: Math.round(kgByCat[k] * 10) / 10, pct: totalCat ? Math.round((kgByCat[k] / totalCat) * 100) : 0 })),
    byDay,
  };
}

type Tab = "livraisons" | "fiche" | "documents" | "contact";

export default function EspaceBeneficiairePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BeneficiaryRow[]>([]);
  const [colRows, setColRows] = useState<CollecteRow[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [tab, setTab] = useState<Tab>("livraisons");
  const [toast, setToast] = useState<string | null>(null);
  const [reqMsg, setReqMsg] = useState("");
  const [sendingReq, setSendingReq] = useState(false);
  const [reqSent, setReqSent] = useState(false);
  const [gran, setGran] = useState<"semaine" | "mois" | "tout">("semaine");
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const ficheT = useRef<number | null>(null);
  const savedT = useRef<number | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setLoading(false);
      const links = await supabase.from("beneficiary_users").select("beneficiary_id").eq("profile_id", auth.user.id);
      const ids = (links.data ?? []).map((r) => r.beneficiary_id as string);
      if (!ids.length) return setLoading(false);
      const [b, c] = await Promise.all([
        supabase.from("beneficiaries").select("id,name,category,address,city_id,fiche,logo_url").in("id", ids).is("deleted_at", null).order("name"),
        supabase.from("collectes").select("id,beneficiary_id,scheduled_date,scheduled_time,status,collecte_items!collecte_id(denree,kg),photo_paths").in("beneficiary_id", ids).order("scheduled_date", { ascending: false }).limit(300),
      ]);
      if (b.error) showToast("Chargement impossible : " + b.error.message + " (la migration 030 est-elle passée ?)");
      const list = (b.data ?? []) as BeneficiaryRow[];
      setRows(list);
      if (list[0]) setCurrentId(list[0].id);
      const cRows = (c.data ?? []) as unknown as CollecteRow[];
      setColRows(cRows);
      const allPaths = Array.from(new Set(cRows.flatMap((r) => r.photo_paths ?? [])));
      if (allPaths.length) {
        const urls = await signedUrls(supabase, allPaths);
        setPhotoUrls(Object.fromEntries(allPaths.map((p, i) => [p, urls[i]])));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const current = rows.find((r) => r.id === currentId);
  const fiche = (current?.fiche ?? {}) as Fiche;
  const todayIso = new Date().toISOString().slice(0, 10);
  const myCollectes = colRows.filter((r) => r.beneficiary_id === currentId);
  const upcoming = myCollectes.filter((r) => r.status === "todo" && r.scheduled_date >= todayIso).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const history = myCollectes.filter((r) => r.status === "collecte").slice(0, 20);

  function periodStats(g: "semaine" | "mois" | "tout") {
    const now = new Date();
    let f: Date, t: Date, label: string;
    if (g === "semaine") {
      f = new Date(now); f.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      t = new Date(f); t.setDate(f.getDate() + 6);
      label = `Semaine du ${f.getDate()} au ${t.getDate()} ${MONTHS_SHORT[t.getMonth()]} ${t.getFullYear()}`;
    } else if (g === "mois") {
      f = new Date(now.getFullYear(), now.getMonth(), 1);
      t = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      label = f.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    } else {
      const first = myCollectes.length ? myCollectes.reduce((a, b) => (a.scheduled_date < b.scheduled_date ? a : b)).scheduled_date : null;
      f = first ? new Date(first + "T00:00:00") : new Date(now.getFullYear(), 0, 1);
      t = now;
      label = `Depuis ${f.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    }
    const fk = isoOf(f), tk = isoOf(t);
    const s = summarizeDropoffs(myCollectes.filter((r) => r.scheduled_date >= fk && r.scheduled_date <= tk));
    return { ...s, periodLabel: label, evo: buildEvo(s.byDay, f, t) };
  }
  const dash = periodStats(gran);
  const maxPct = Math.max(1, ...dash.denrees.map((x) => x.pct));

  const contacts = (fiche.contacts as Contact[]) ?? [];
  const access = (fiche.access as Record<string, boolean>) ?? {};
  const accessNote = (fiche.accessNote as string) ?? "";
  const hours = (fiche.hours as Record<string, Hours>) ?? {};
  const denrees = (fiche.denrees as Record<string, boolean>) ?? {};
  const comment = (fiche.comment as string) ?? "";
  const structureType = (fiche.structureType as string) ?? "";
  const statut = (fiche.statut as string) ?? "";
  const publicCibles = (fiche.publicCibles as Record<string, boolean>) ?? {};
  const beneficiaryCount = (fiche.beneficiaryCount as string) ?? "";
  const beneficiaryCountNum = Math.min(1500, Math.max(1, parseInt(beneficiaryCount, 10) || 50));
  const network = (fiche.network as string) ?? "";
  const description = (fiche.description as string) ?? "";
  const acceptsFresh = !!(fiche.acceptsFresh as boolean | undefined);
  const creneaux = (fiche.creneaux as Creneaux) ?? {};

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  async function sendRequest() {
    if (!reqMsg.trim() || !currentId) return;
    setSendingReq(true);
    const { error } = await supabase.rpc("request_beneficiary_update", { p_beneficiary_id: currentId, p_message: reqMsg.trim() });
    setSendingReq(false);
    if (error) return showToast("Demande non envoyée : " + error.message + " (la migration 030 est-elle passée ?)");
    setReqMsg("");
    setReqSent(true);
    showToast("Demande envoyée à l'équipe Linkee.");
  }

  function autosave() {
    setSaved(true);
    if (savedT.current) window.clearTimeout(savedT.current);
    savedT.current = window.setTimeout(() => setSaved(false), 1500);
  }
  // Champs en self-service (logo, frais, jauge, description, contacts, créneaux de livraison fixe) : écrits
  // directement dans beneficiaries.fiche. Le reste de la fiche (horaires, accès, denrées…) reste géré par
  // l'équipe Linkee, via la demande de modification ci-dessous.
  function patchFiche(p: Partial<Fiche>) {
    if (!currentId) return;
    const cur = rows.find((r) => r.id === currentId);
    if (!cur) return;
    const f: Fiche = { ...(cur.fiche ?? {}), ...p };
    setRows((prev) => prev.map((r) => (r.id === currentId ? { ...r, fiche: f } : r)));
    if (ficheT.current) window.clearTimeout(ficheT.current);
    const id = currentId;
    ficheT.current = window.setTimeout(async () => {
      const { error } = await supabase.from("beneficiaries").update({ fiche: f }).eq("id", id);
      if (error) showToast("Enregistrement impossible : " + error.message);
      else autosave();
    }, 700);
  }
  async function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !currentId) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return showToast("Choisissez une image de 2 Mo maximum.");
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${currentId}/logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: true });
    if (up.error) return showToast("Import du logo impossible : " + up.error.message + " (la migration 041 est-elle passée ?)");
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("beneficiaries").update({ logo_url: url }).eq("id", currentId);
    if (error) return showToast("Logo non enregistré : " + error.message);
    setRows((prev) => prev.map((r) => (r.id === currentId ? { ...r, logo_url: url } : r)));
    autosave();
    showToast("Logo mis à jour.");
  }

  const toastEl = toast && <div className="fixed bottom-[22px] left-1/2 z-[99] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[12.5px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-[13px] text-[var(--slate)]">Chargement de votre espace…</div>;
  }
  if (!current) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-[380px] rounded-[28px] bg-[var(--card)] px-7 py-8 text-center shadow-[var(--shadow)]">
          <span className="font-script text-[32px] leading-none">linkee</span>
          <h1 className="mt-4 font-display text-[22px] font-black">Aucune association rattachée</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--slate)]">Ce compte n&apos;est relié à aucune association pour l&apos;instant. Contactez votre référent Linkee.</p>
          <button type="button" onClick={logout} className="mt-5 w-full rounded-[40px] bg-[var(--navy-deep)] py-3 font-display text-base font-bold text-[var(--panel-fg)]">Se déconnecter</button>
        </div>
      </div>
    );
  }

  const tabs: { k: Tab; l: string; icon: ReactNode }[] = [
    { k: "livraisons", l: "Mes livraisons", icon: CAL },
    { k: "fiche", l: "Ma fiche", icon: STORE },
    { k: "documents", l: "Mes documents", icon: DOC },
    { k: "contact", l: "Nous contacter", icon: PHONE },
  ];

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-[var(--navy-deep)] px-6 py-3.5 text-[var(--panel-fg)] shadow-[var(--shadow)]">
        <Wordmark />
        {rows.length > 1 && (
          <div className="flex items-center gap-2 rounded-[40px] border border-[rgba(253,244,237,0.25)] bg-[rgba(253,244,237,0.1)] py-1.5 pr-2 pl-3.5">
            <Icon className="h-3.5 w-3.5 flex-none text-[var(--turquoise)]" sw={2}>{PIN}</Icon>
            <select
              value={currentId}
              onChange={(e) => {
                setCurrentId(e.target.value);
                setReqSent(false);
              }}
              className="bg-transparent text-[12.5px] font-bold text-[var(--panel-fg)] outline-none"
            >
              {rows.map((r) => (
                <option key={r.id} value={r.id} className="text-[#111]">{r.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 text-[12.5px]">
          <span>{current.name}</span>
          <button type="button" onClick={logout} className="text-xs font-semibold text-[var(--panel-fg-dim)] hover:text-[var(--panel-fg)]">Déconnexion</button>
        </div>
      </div>

      <div className="sticky top-[57px] z-[19] flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--card)] px-6">
        {tabs.map((t) => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)} className={`flex items-center gap-[7px] border-b-[3px] px-3.5 pt-3.5 pb-3 text-[13px] font-bold whitespace-nowrap ${tab === t.k ? "border-[var(--turquoise)] text-[var(--navy)]" : "border-transparent text-[var(--slate)]"}`}>
            <Icon>{t.icon}</Icon>
            {t.l}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-[720px] px-4 pt-[18px] pb-16 sm:px-6">
        {tab === "livraisons" && (
          <>
            <Card title="Prochaines livraisons" icon={CAL}>
              {upcoming.length ? (
                upcoming.map((r) => {
                  const s = summarizeItems(r.collecte_items);
                  return <CollectRow key={r.id} date={r.scheduled_date} note={`${r.scheduled_time ? r.scheduled_time.slice(0, 5) + " · " : ""}${s.denree}`} badge="À venir" badgeCls="bg-[var(--client-req-bg)] text-[var(--client-req)]" />;
                })
              ) : (
                <p className="text-[11.5px] text-[var(--slate)]">Aucune livraison planifiée pour l&apos;instant.</p>
              )}
            </Card>
            <Card title="Historique des livraisons" icon={CLOCK} note="Quantités reçues lors de vos dernières livraisons Linkee, avec la photo prise par le logisticien.">
              {history.length ? (
                history.map((r) => {
                  const s = summarizeItems(r.collecte_items);
                  const photos = (r.photo_paths ?? []).map((p) => photoUrls[p]).filter(Boolean);
                  return <CollectRow key={r.id} date={r.scheduled_date} note={s.denree} badge={`${s.kg} kg`} badgeCls="bg-[var(--good-bg)] text-[var(--good)]" photos={photos} />;
                })
              ) : (
                <p className="text-[11.5px] text-[var(--slate)]">Aucun historique pour l&apos;instant.</p>
              )}
            </Card>

            <div className="mt-8 mb-3.5 flex items-center gap-3.5">
              <h2 className="font-display text-[20px] font-black whitespace-nowrap text-[var(--navy)]">Tableau de bord</h2>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>
            <GranToggle options={[["semaine", "Semaine"], ["mois", "Mois"], ["tout", "Depuis le début"]]} value={gran} onChange={(v) => setGran(v as typeof gran)} />
            <p className="mb-3.5 text-[12px] text-[var(--slate)]">{dash.periodLabel}</p>
            <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Poids total reçu" value={`${dash.volume} kg`} sub={dash.periodLabel} />
              <Tile label="Livraisons reçues" value={String(dash.ok)} sub={`${dash.annulees} annulée(s)`} />
              <Tile label="Poids moyen par livraison" value={`${dash.avg} kg`} sub="sur la période" />
              <Tile label="Taux de livraisons réalisées" value={`${dash.taux} %`} sub="sur la période" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
              <Card title="Évolution du poids reçu" note="Poids reçu par période"><EvoChart data={dash.evo} /></Card>
              <Card title="Typologie des denrées reçues" note="Sur la période sélectionnée">
                {dash.denrees.every((x) => x.kg === 0) ? (
                  <p className="text-[11.5px] text-[var(--slate)]">Pas encore de donnée sur cette période.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {dash.denrees.map((x) => (
                      <div key={x.k} className="grid grid-cols-[110px_1fr_64px] items-center gap-2.5">
                        <span className="text-xs font-semibold">{CAT_LABELS[x.k]}</span>
                        <span className="h-[11px] overflow-hidden rounded-md bg-[var(--track)]"><span className="block h-full rounded-md" style={{ width: `${Math.round((x.pct / maxPct) * 100)}%`, background: CAT_COLORS[x.k] }} /></span>
                        <span className="text-right text-[11.5px] font-semibold text-[var(--slate)]">{x.pct}% · {x.kg}kg</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {tab === "fiche" && (
          <>
            <Card title="Logo de votre structure" icon={STORE} note="Affiché en haut de votre espace.">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--input-bg)]">
                  {current.logo_url ? <img src={current.logo_url} alt="Logo" className="h-full w-full object-cover" /> : <span className="text-[10px] font-semibold text-[var(--muted)]">Aucun logo</span>}
                </div>
                <button type="button" onClick={() => logoInput.current?.click()} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                  Changer le logo
                </button>
                <input ref={logoInput} type="file" accept="image/*" hidden onChange={onLogo} />
                {saved && <span className="text-[11.5px] font-semibold text-[var(--good)]">Enregistré ✓</span>}
              </div>
            </Card>

            <Card title="Informations générales" icon={STORE}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Info label="Nom" value={current.name} />
                <Info label="Type de structure" value={structureType || "Non renseigné"} />
                <Info label="Adresse" value={current.address || "Non renseignée"} />
                <Info label="Statut" value={statut || "Non renseigné"} />
                <Info label="Réseau / fédération" value={network || "—"} />
              </div>

              <div className="mt-4">
                <span className="mb-1.5 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Nombre de bénéficiaires accueillis par semaine</span>
                <div className="flex items-center gap-3.5">
                  <input type="range" min={1} max={1500} value={beneficiaryCountNum} onChange={(e) => patchFiche({ beneficiaryCount: e.target.value })} className="h-1.5 flex-1 accent-[var(--turquoise)]" />
                  <span className="w-16 flex-none text-right font-display text-[18px] font-black text-[var(--navy)]">{beneficiaryCountNum}</span>
                </div>
              </div>

              <div className="mt-4">
                <span className="mb-1.5 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Produits frais</span>
                <button
                  type="button"
                  onClick={() => patchFiche({ acceptsFresh: !acceptsFresh })}
                  className={`inline-flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3.5 py-2 text-xs font-semibold ${acceptsFresh ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"}`}
                >
                  {acceptsFresh && <CheckIcon className="h-3 w-3" />}
                  {acceptsFresh ? "Peut recevoir des produits frais" : "Ne peut pas recevoir de produits frais"}
                </button>
              </div>

              <div className="mt-4">
                <span className="mb-1.5 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Présentez votre structure et vos missions</span>
                <textarea
                  className="w-full rounded-[13px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-[11px] text-sm font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                  rows={3}
                  placeholder="Qui êtes-vous, qui accueillez-vous, quelles sont vos missions…"
                  value={description}
                  onChange={(e) => patchFiche({ description: e.target.value })}
                />
              </div>
            </Card>

            <Card title="Horaires d'ouverture" icon={CLOCK}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DAYS.map((d) => {
                  const h = hours[d.k];
                  return (
                    <div key={d.k} className="flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[12.5px]">
                      <span className="font-semibold text-[var(--navy)]">{d.l}</span>
                      <span className="text-[var(--slate)]">{h ? `${h.open} – ${h.close}` : "Fermé"}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Créneau de livraison fixe" icon={CLOCK} note="En plus de vos horaires d'ouverture ci-dessus : le ou les créneaux où Linkee peut passer régulièrement.">
              <SlotsEditor value={creneaux} onChange={(v) => patchFiche({ creneaux: v })} />
            </Card>

            <Card title="Denrées acceptées" icon={STORE}>
              <div className="flex flex-wrap gap-2">
                {DENREE_OPTIONS.map((d) => <Chip key={d} label={d} on={!!denrees[d]} />)}
              </div>
            </Card>

            <Card title="Public accueilli" icon={STORE}>
              {Object.keys(publicCibles).length ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(publicCibles).filter(([, v]) => v).map(([k]) => <Chip key={k} label={k} on />)}
                </div>
              ) : (
                <p className="text-[11.5px] text-[var(--slate)]">Non renseigné.</p>
              )}
            </Card>

            <Card title="Accès" icon={STORE}>
              <div className="flex flex-wrap gap-2">
                {ACCESS_OPTIONS.map((a) => <Chip key={a.k} label={a.l} on={!!access[a.k]} />)}
              </div>
              {accessNote && <p className="mt-2.5 text-[12px] text-[var(--slate)]">{accessNote}</p>}
            </Card>

            <Card title="Contacts" icon={STORE}>
              <ContactsEditor value={contacts} onChange={(v) => patchFiche({ contacts: v })} />
            </Card>

            {comment && (
              <Card title="Commentaires de l'équipe Linkee" icon={STORE}>
                <p className="text-[12.5px] leading-[1.5] text-[var(--slate)]">{comment}</p>
              </Card>
            )}

            <Card title="Demander une modification" icon={STORE} note="Le logo, les champs ci-dessus et les contacts sont modifiables directement. Pour le reste (horaires, accès, types de denrées…), envoyez une demande ci-dessous.">
              <textarea
                className="w-full rounded-[13px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-[11px] text-sm font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                rows={3}
                placeholder="Ex : notre nouvel horaire du mardi est 14h-17h"
                value={reqMsg}
                onChange={(e) => setReqMsg(e.target.value)}
              />
              <button type="button" disabled={sendingReq || !reqMsg.trim()} onClick={sendRequest} className="mt-2.5 rounded-[40px] bg-[var(--navy-deep)] px-[18px] py-2.5 font-display text-[13px] font-bold text-[var(--panel-fg)] disabled:opacity-60">
                {sendingReq ? "Envoi…" : "Envoyer la demande"}
              </button>
              {reqSent && (
                <div className="mt-2.5 flex items-center gap-2 text-[12px] font-semibold text-[var(--good)]">
                  <CheckIcon className="h-3.5 w-3.5" /> Demande envoyée à l&apos;équipe Linkee.
                </div>
              )}
            </Card>
          </>
        )}

        {tab === "documents" && <PartnerDocuments key={currentId} beneficiaryId={currentId} role="beneficiaire" />}
        {tab === "contact" && <ContactTab key={currentId} cityId={current.city_id} />}
      </div>
      {toastEl}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-0.5 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{label}</span>
      <span className="text-[13.5px] font-semibold text-[var(--navy)]">{value}</span>
    </div>
  );
}
