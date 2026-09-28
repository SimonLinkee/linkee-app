"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photos";
import { CAT_LABELS, DEFAULT_EUR_PER_KG, SUBCAT_SELECT, buildEvo, isCollectKind, isoOf, rse, subMap, summarize, type CatKey, type StatRow, type SubCat } from "@/lib/stats";
import PartnerDocuments from "@/components/partner/PartnerDocuments";
import PartnerValuation from "@/components/partner/PartnerValuation";

/* ---------------- types ---------------- */
type Contact = { type: string; nom: string; tel: string; mail: string };
type Hours = { open: string; close: string } | null;
type HistoryEntry = { date: string; time: string; denree: string; kg: number; status: "ok" | "annulee" };
type Fiche = Record<string, unknown>;
type PartnerRow = { id: string; name: string; site_label: string | null; category: string | null; address: string | null; logo_url: string | null; photo_url: string | null; fiche: Fiche | null };
type CollecteRow = StatRow & { scheduled_time: string | null };
type Site = {
  id: string;
  fiche: Fiche;
  label: string;
  name: string;
  address: string;
  contacts: Contact[];
  access: Record<string, boolean>;
  accessNote: string;
  hours: Record<string, Hours>;
  denrees: Record<string, boolean>;
  logo: string | null;
  adminInfo: { slot: string; denree: string; volumeRange: string; comment: string };
  upcoming: { date: string; time: string; note: string }[];
  history: HistoryEntry[];
};
type DashPeriod = {
  periodLabel: string;
  volume: number;
  don: number;
  customShare: number;
  collectes: number;
  ok: number;
  annulees: number;
  denrees: { k: CatKey; pct: number; kg: number }[];
  evo: { l: string; v: number }[];
};
type Request = { id?: string; site: string; date: string; time: string; denree: string; volume: string; comment: string; status?: string };
type DbReq = { id: string; partner_id: string; wished_date: string; wished_time: string | null; denree: string | null; volume_kg: number | null; comment: string | null; status: string };

const DEFAULT_HOURS: Record<string, Hours> = {
  lun: { open: "09:00", close: "18:00" }, mar: { open: "09:00", close: "18:00" }, mer: { open: "09:00", close: "18:00" },
  jeu: { open: "09:00", close: "18:00" }, ven: { open: "09:00", close: "18:00" }, sam: null, dim: null,
};
const MONTHS_SHORT = ["janv.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function siteFromRow(r: PartnerRow, upcoming: Site["upcoming"], history: HistoryEntry[]): Site {
  const f = (r.fiche ?? {}) as Fiche;
  const denrees = (f.denrees as Record<string, boolean>) ?? {};
  return {
    id: r.id,
    fiche: f,
    label: r.site_label || r.name,
    name: r.name,
    address: r.address ?? "",
    contacts: (f.contacts as Contact[]) ?? [],
    access: (f.access as Record<string, boolean>) ?? {},
    accessNote: (f.accessNote as string) ?? "",
    hours: (f.hours as Record<string, Hours>) ?? DEFAULT_HOURS,
    denrees,
    logo: r.logo_url,
    adminInfo: {
      slot: ((f.slotDisplay || f.creneau) as string) || "Non renseigné",
      denree: DENREE_OPTIONS_LIST.filter((d) => denrees[d]).join(", ") || "Non renseigné",
      volumeRange: (f.volumeRange as string) ?? "",
      comment: (f.partnerComment as string) ?? "",
    },
    upcoming,
    history,
  };
}
const DENREE_OPTIONS_LIST = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];

const ACCESS_OPTIONS = [
  { k: "digicode", l: "Digicode" }, { k: "quai", l: "Quai de livraison" }, { k: "camion", l: "Accès camion" },
  { k: "etage", l: "Étage / ascenseur" }, { k: "horaire", l: "Horaire strict" },
];
const DENREE_OPTIONS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const DAYS = [
  { k: "lun", l: "Lundi" }, { k: "mar", l: "Mardi" }, { k: "mer", l: "Mercredi" }, { k: "jeu", l: "Jeudi" },
  { k: "ven", l: "Vendredi" }, { k: "sam", l: "Samedi" }, { k: "dim", l: "Dimanche" },
];
const VOLUME_BUCKETS = ["10/20kg", "20/50kg", "50/100kg", "100/250kg", "250/500kg", "+500kg"];

const CAT_COLORS: Record<CatKey, string> = { secs: "var(--cat-1)", fl: "var(--cat-2)", frais: "var(--cat-3)", plats: "var(--cat-4)", boulang: "var(--cat-5)" };
const CAT_PRINT: Record<CatKey, string> = { secs: "#2a78d6", fl: "#eb6834", frais: "#1baf7a", plats: "#eda100", boulang: "#a9673b" };

/** One point per month between two dates (for year / since-the-beginning views). */
function monthlyEvo(byDay: Record<string, number>, from: Date, to: Date) {
  const out: { l: string; v: number }[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    const prefix = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    const v = Object.entries(byDay).reduce((s, [d, kg]) => (d.startsWith(prefix) ? s + kg : s), 0);
    out.push({ l: MONTHS_SHORT[cur.getMonth()], v: Math.round(v) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/* ---------------- helpers ---------------- */
const fmtNum = (n: number) => Math.round(n).toLocaleString("fr-FR");
function fmtDateShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return { dow: d.toLocaleDateString("fr-FR", { weekday: "short" }), dom: d.getDate(), full: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) };
}

const fieldCls = "w-full rounded-[13px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-[11px] text-sm font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1.5 block text-[12.5px] font-semibold text-[var(--navy)]";

function Icon({ children, className = "h-4 w-4", sw = 1.8 }: { children: ReactNode; className?: string; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}
const CheckIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => <Icon className={className} sw={2.4}><path d="M20 6 L9 17 L4 12" /></Icon>;
const PIN = <><path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></>;
const CAL = <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9.5 H20.5 M8 3 V6.5 M16 3 V6.5" /></>;
const LOCK = <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10 V7 A4 4 0 0 1 16 7 V10" /></>;
const GRID = <><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" /><rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5" /><rect x="13" y="10" width="7.5" height="10.5" rx="1.5" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" /></>;
const CLOCK = <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5 V12 L15 14" /></>;
const STORE = <><path d="M4 8 L8 4 H16 L20 8" /><rect x="4" y="8" width="16" height="11" rx="1.5" /><path d="M4 8 H20" /></>;
const DOC = <><path d="M7 3 H14 L19 8 V21 H7 Z" /><path d="M14 3 V8 H19" /></>;

function Wordmark({ size = "text-[22px]", color = "text-[var(--panel-fg)]" }: { size?: string; color?: string }) {
  return (
    <span className="flex items-end gap-0.5">
      <span className={`font-script leading-none ${size} ${color}`}>linkee</span>
    </span>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" className="block h-full w-full">
      <circle cx="20" cy="20" r="20" fill="var(--navy-deep)" />
      <path d="M9 23 Q9 14 20 14 Q31 14 31 23 Q31 29 20 29 Q9 29 9 23 Z" fill="var(--turquoise)" />
      <path d="M14.5 17.5 L17 26 M20 16 L20 27.5 M25.5 17.5 L23 26" stroke="var(--navy-deep)" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}
function LogoContent({ logo }: { logo: string | null }) {
  if (logo === "demo") return <LogoMark />;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className="block h-full w-full object-cover" />;
  }
  return null;
}
function Avatar({ site, size }: { site: Site; size: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex flex-none items-center justify-center overflow-hidden rounded-full font-display font-bold ${site.logo ? "" : "bg-[var(--turquoise)] text-[#04262e]"}`}
    >
      {site.logo ? <LogoContent logo={site.logo} /> : site.name.charAt(0)}
    </span>
  );
}

function Card({ title, icon, note, tag, locked, children }: { title?: string; icon?: ReactNode; note?: string; tag?: string; locked?: boolean; children: ReactNode }) {
  return (
    <div className={`mb-4 rounded-[18px] border px-[22px] py-5 shadow-[var(--shadow)] ${locked ? "border-[var(--turquoise)] bg-gradient-to-br from-[var(--card)] to-[var(--input-bg)]" : "border-[var(--border)] bg-[var(--card)]"}`}>
      {title && (
        <h3 className="mb-[3px] flex items-center gap-2 font-display text-base font-extrabold">
          {icon && <Icon className="h-[17px] w-[17px] text-[var(--turquoise)]">{icon}</Icon>}
          {title}
          {tag && <span className="ml-auto flex-none rounded-[40px] bg-[var(--navy-deep)] px-[9px] py-[3px] text-[9.5px] font-bold tracking-[0.03em] text-[var(--panel-fg)] uppercase">{tag}</span>}
        </h3>
      )}
      {note && <p className="mb-3.5 text-[11.5px] text-[var(--slate)]">{note}</p>}
      {children}
    </div>
  );
}

function PanelHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-[18px]">
      <h2 className="mb-1 font-display text-[26px] font-black">{title}</h2>
      <p className="text-[13px] text-[var(--slate)]">{sub}</p>
    </div>
  );
}

function ChipToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[40px] border-[1.5px] px-[13px] py-2 text-xs font-semibold ${checked ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"}`}>
      <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <CheckIcon className={`h-3 w-3 ${checked ? "opacity-100" : "opacity-0"}`} />
      <span>{label}</span>
    </label>
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

function CollectRow({ date, time, note, badge, badgeCls, req }: { date: string; time: string; note: string; badge: string; badgeCls?: string; req?: boolean }) {
  const d = fmtDateShort(date);
  return (
    <div className={`flex items-center gap-3.5 py-3 ${req ? "-mx-3.5 rounded-xl bg-[var(--client-req-bg)] px-3.5" : "border-b border-[var(--border)] last:border-b-0"}`}>
      <span className="w-16 flex-none text-center">
        <span className="block text-[10px] font-bold text-[var(--slate)] uppercase">{d.dow}</span>
        <span className="block font-display text-[22px] font-black">{d.dom}</span>
      </span>
      <span className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">{time}</div>
        <div className="mt-0.5 text-[11.5px] text-[var(--slate)]">{note}</div>
      </span>
      <span className={`flex-none rounded-[40px] px-2.5 py-[5px] text-[10px] font-bold whitespace-nowrap uppercase ${badgeCls ?? (req ? "bg-[var(--client-req)] text-white" : "bg-[var(--track)] text-[var(--slate)]")}`}>{badge}</span>
    </div>
  );
}

function ExcForm({ siteName, onSubmit }: { siteName: string; onSubmit: (r: Omit<Request, "site">) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("15:00");
  const [denree, setDenree] = useState(DENREE_OPTIONS[0]);
  const [volume, setVolume] = useState("");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");

  function toggle() {
    if (!open) {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      setDate(d.toISOString().slice(0, 10));
      setConfirm(null);
      setErr("");
    }
    setOpen(!open);
  }
  async function submit() {
    if (!date) return setErr("Choisissez une date pour votre demande.");
    const ok = await onSubmit({ date, time, denree, volume, comment });
    if (!ok) return;
    setConfirm(`${siteName} — ${fmtDateShort(date).full} à ${time} · ${denree}${volume ? ` · ~${volume} kg` : ""}`);
    setOpen(false);
    setVolume("");
    setComment("");
  }
  return (
    <>
      <button type="button" onClick={toggle} className="mt-3.5 flex w-full items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] px-4 py-[13px] text-[13.5px] font-bold text-[var(--navy)] hover:border-[var(--client-req)] hover:text-[var(--client-req)]">
        <Icon sw={2.2}><path d="M12 5 V19 M5 12 H19" /></Icon>
        Faire une demande de collecte exceptionnelle
      </button>
      {open && (
        <div className="mt-3.5 border-t border-dashed border-[var(--border)] pt-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Date souhaitée</label><input className={fieldCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className={labelCls}>Créneau souhaité</label><input className={fieldCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div>
              <label className={labelCls}>Type de denrée</label>
              <select className={fieldCls} value={denree} onChange={(e) => setDenree(e.target.value)}>{DENREE_OPTIONS.map((d) => <option key={d}>{d}</option>)}</select>
            </div>
            <div><label className={labelCls}>Volume approximatif (kg)</label><input className={fieldCls} type="number" min={0} placeholder="Ex : 15" value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>Commentaire (optionnel)</label><textarea className={fieldCls} rows={2} placeholder="Contexte, urgence, quantité inhabituelle…" value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          </div>
          {err && <div className="mt-2 text-[11.5px] text-[var(--critical)]">{err}</div>}
          <div className="mt-3 flex gap-2.5">
            <button type="button" onClick={submit} className="rounded-[40px] bg-[var(--client-req)] px-[18px] py-2.5 font-display text-[13.5px] font-bold text-white">Envoyer la demande</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2.5 font-display text-[13.5px] font-bold text-[var(--slate)]">Annuler</button>
          </div>
        </div>
      )}
      {confirm && (
        <div className="mt-3.5 rounded-[14px] bg-[var(--client-req-bg)] px-4 py-3.5">
          <div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold text-[var(--client-req)]"><CheckIcon className="h-4 w-4" />Demande envoyée à Linkee</div>
          <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-l-4 border-[var(--client-req)] bg-[var(--card)] px-3 py-2.5">
            <span className="flex-none rounded-[40px] bg-[var(--client-req)] px-2 py-[3px] text-[9px] font-bold text-white uppercase">Demande exceptionnelle client</span>
            <span className="flex-1 text-xs font-semibold">{confirm}</span>
          </div>
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--slate)] italic">Elle apparaîtra dans le Planning de l&apos;équipe Linkee, en attente de validation par l&apos;administrateur avant d&apos;être confirmée.</p>
        </div>
      )}
    </>
  );
}

function UpcomingList({ site, siteKey, requests }: { site: Site; siteKey: string; requests: Request[] }) {
  const reqs = requests.filter((r) => r.site === siteKey);
  if (!reqs.length && !site.upcoming.length) return <p className="text-[11.5px] text-[var(--slate)]">Aucune collecte planifiée pour l&apos;instant.</p>;
  return (
    <div>
      {reqs.map((r, i) => <CollectRow key={"r" + i} req date={r.date} time={r.time} note={`${r.denree} · ${r.volume || "?"} kg estimés`} badge="Demande client" />)}
      {site.upcoming.map((u, i) => <CollectRow key={i} date={u.date} time={u.time} note={u.note} badge="À venir" />)}
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={200}>
      {[0, 1, 2, 3].map((g) => {
        const gy = padT + plotH - (g / 3) * plotH;
        return (
          <g key={g}>
            <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--track)" strokeWidth={1} />
            <text x={padL - 6} y={gy + 3} fontSize={9} fill="var(--muted)" textAnchor="end">{Math.round((niceMax * g) / 3)}</text>
          </g>
        );
      })}
      <path d={area} fill="var(--seq-tint)" />
      <path d={line} fill="none" stroke="var(--seq)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const last = i === pts.length - 1;
        return <circle key={i} cx={p.x} cy={p.y} r={last ? 4 : 3} fill={last ? "var(--seq)" : "var(--card)"} stroke="var(--seq)" strokeWidth={2} />;
      })}
      {pts.map((p, i) => <text key={i} x={p.x} y={H - 6} fontSize={9.5} fill="var(--muted)" textAnchor="middle">{p.l}</text>)}
    </svg>
  );
}

/* ---------------- page ---------------- */
type Mode = "choice" | "desktop" | "mobile";
type Tab = "activite" | "fiche" | "dashboard" | "documents" | "valorisation";

export default function EspacePartenairePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choice");
  const [tab, setTab] = useState<Tab>("activite");
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [partnerRows, setPartnerRows] = useState<PartnerRow[]>([]);
  const [colRows, setColRows] = useState<CollecteRow[]>([]);
  const [reqRows, setReqRows] = useState<DbReq[]>([]);
  const [subList, setSubList] = useState<SubCat[]>([]);
  const [siteKey, setSiteKey] = useState("");
  const [gran, setGran] = useState<"semaine" | "mois" | "tout">("semaine");
  const [granM, setGranM] = useState<"semaine" | "mois" | "annee">("semaine");
  const [from, setFrom] = useState(() => isoOf(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => isoOf(new Date()));
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const toastT = useRef<number | null>(null);
  const savedT = useRef<number | null>(null);
  const ficheT = useRef<number | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const sitePhotoInput = useRef<HTMLInputElement>(null);
  const [isSmall, setIsSmall] = useState(false);
  useEffect(() => setIsSmall(window.innerWidth <= 640), []);

  useEffect(() => {
    (async () => {
      const { data: ps, error } = await supabase.from("partners").select("id,name,site_label,category,address,logo_url,photo_url,fiche").eq("active", true).order("name");
      if (error) showToast("Chargement impossible : " + error.message);
      const partners = (ps ?? []) as PartnerRow[];
      setPartnerRows(partners);
      if (partners[0]) setSiteKey(partners[0].id);
      if (partners.length) {
        const ids = partners.map((p) => p.id);
        const [col, rq, sb] = await Promise.all([
          supabase.from("collectes").select("scheduled_date,scheduled_time,kind,status,motif,source,partner_id,partners(name,category),collecte_items!collecte_id(denree,kg,subcategory_id,quantity,unit)").in("partner_id", ids).order("scheduled_date").limit(5000),
          supabase.from("exceptional_requests").select("id,partner_id,wished_date,wished_time,denree,volume_kg,comment,status").in("partner_id", ids).order("created_at"),
          supabase.from("partner_subcategories").select(SUBCAT_SELECT).in("partner_id", ids),
        ]);
        setColRows((col.data ?? []) as unknown as CollecteRow[]);
        setReqRows((rq.data ?? []) as DbReq[]);
        setSubList(((sb.data ?? []) as unknown as SubCat[]).map((s) => ({ ...s, unit_price: s.unit_price == null ? null : Number(s.unit_price), unit_weight_kg: s.unit_weight_kg == null ? null : Number(s.unit_weight_kg) })));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const todayIso = isoOf(new Date());
  const sites: Record<string, Site> = useMemo(() => {
    const out: Record<string, Site> = {};
    for (const p of partnerRows) {
      const mine = colRows.filter((r) => r.partner_id === p.id && isCollectKind(r.kind));
      const upcoming = mine
        .filter((r) => r.scheduled_date >= todayIso && r.status === "todo")
        .map((r) => ({ date: r.scheduled_date, time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : "—", note: r.kind === "partner" ? "Collecte planifiée" : "Collecte exceptionnelle" }));
      const history: HistoryEntry[] = mine
        .filter((r) => r.status === "collecte" || r.status === "annule")
        .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
        .slice(0, 10)
        .map((r) => {
          const items = r.collecte_items ?? [];
          return {
            date: r.scheduled_date,
            time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : "—",
            denree: (Array.from(new Set(items.map((i) => i.denree).filter(Boolean))).join(", ") || "—") + (r.source === "manual" ? " · saisie manuelle" : ""),
            kg: Math.round(items.reduce((s, i) => s + (Number(i.kg) || 0), 0) * 10) / 10,
            status: r.status === "annule" ? "annulee" : "ok",
          };
        });
      out[p.id] = siteFromRow(p, upcoming, history);
    }
    return out;
  }, [partnerRows, colRows, todayIso]);
  const site = sites[siteKey];

  const requests: Request[] = reqRows
    .filter((r) => r.status === "en_attente")
    .map((r) => ({ id: r.id, site: r.partner_id, date: r.wished_date, time: r.wished_time?.slice(0, 5) ?? "—", denree: r.denree ?? "", volume: r.volume_kg ? String(r.volume_kg) : "", comment: r.comment ?? "", status: r.status }));
  const subs = useMemo(() => subMap(subList.filter((s) => s.partner_id === siteKey)), [subList, siteKey]);

  /* ---- statistics (real data) ---- */
  const siteRows = useMemo(() => colRows.filter((r) => r.partner_id === siteKey), [colRows, siteKey]);
  function periodStats(g: "semaine" | "mois" | "annee" | "tout"): DashPeriod {
    const now = new Date();
    let f: Date;
    let t: Date;
    let label: string;
    if (g === "semaine") {
      f = new Date(now);
      f.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      t = new Date(f);
      t.setDate(f.getDate() + 6);
      label = `Semaine du ${f.getDate()} au ${t.getDate()} ${MONTHS_SHORT[t.getMonth()]} ${t.getFullYear()}`;
    } else if (g === "mois") {
      f = new Date(now.getFullYear(), now.getMonth(), 1);
      t = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      label = `${f.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    } else if (g === "annee") {
      f = new Date(now.getFullYear(), 0, 1);
      t = new Date(now.getFullYear(), 11, 31);
      label = `Année ${now.getFullYear()}`;
    } else {
      const first = siteRows[0]?.scheduled_date;
      f = first ? new Date(first + "T00:00:00") : new Date(now.getFullYear(), 0, 1);
      t = now;
      label = `Depuis ${f.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    }
    const fk = isoOf(f);
    const tk = isoOf(t);
    const s = summarize(siteRows.filter((r) => r.scheduled_date >= fk && r.scheduled_date <= tk), subs);
    return {
      periodLabel: label,
      volume: s.volume,
      don: s.don,
      customShare: s.customShare,
      collectes: s.collectes,
      ok: s.ok,
      annulees: s.annulees,
      denrees: s.denrees,
      evo: g === "semaine" || g === "mois" ? buildEvo(s.byDay, f, t) : monthlyEvo(s.byDay, f, t),
    };
  }
  const dash = periodStats(gran);
  const dashM = periodStats(granM);
  const rseSum = summarize(siteRows.filter((r) => r.scheduled_date >= from && r.scheduled_date <= to), subs);

  function showToast(msg: string) {
    setToast(msg);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 3200);
  }
  function autosave() {
    setSaved(true);
    if (savedT.current) window.clearTimeout(savedT.current);
    savedT.current = window.setTimeout(() => setSaved(false), 1500);
  }
  // Partner-editable parts of the fiche are saved back into the partners.fiche jsonb column.
  function patch(p: Partial<Site>) {
    const cur = partnerRows.find((r) => r.id === siteKey);
    if (!cur) return;
    const f: Fiche = { ...(cur.fiche ?? {}) };
    if (p.contacts) f.contacts = p.contacts;
    if (p.access) f.access = p.access;
    if (p.accessNote !== undefined) f.accessNote = p.accessNote;
    if (p.hours) f.hours = p.hours;
    if (p.denrees) f.denrees = p.denrees;
    setPartnerRows((prev) => prev.map((r) => (r.id === siteKey ? { ...r, fiche: f } : r)));
    if (ficheT.current) window.clearTimeout(ficheT.current);
    const id = siteKey;
    ficheT.current = window.setTimeout(async () => {
      const { error } = await supabase.from("partners").update({ fiche: f }).eq("id", id);
      if (error) showToast("Enregistrement impossible : " + error.message);
      else autosave();
    }, 700);
  }
  function changeSite(k: string) {
    setSiteKey(k);
    showToast("Vous consultez maintenant : " + sites[k].name);
  }
  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  async function addRequest(r: Omit<Request, "site">): Promise<boolean> {
    const { data, error } = await supabase
      .from("exceptional_requests")
      .insert({ partner_id: siteKey, wished_date: r.date, wished_time: r.time || null, denree: r.denree, volume_kg: r.volume ? +r.volume : null, comment: r.comment || null })
      .select("id,partner_id,wished_date,wished_time,denree,volume_kg,comment,status")
      .single();
    if (error || !data) {
      showToast("Demande non envoyée : " + (error?.message ?? "erreur inconnue"));
      return false;
    }
    setReqRows((prev) => [...prev, data as DbReq]);    showToast("Demande envoyée — elle apparaîtra en violet dans le Planning Linkee, en attente de validation.");
    return true;
  }
  async function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return showToast("Choisissez une image de 2 Mo maximum.");
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${siteKey}/logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: true });
    if (up.error) return showToast("Import du logo impossible : " + up.error.message);
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("partners").update({ logo_url: url }).eq("id", siteKey);
    if (error) return showToast("Logo non enregistré : " + error.message);
    setPartnerRows((prev) => prev.map((r) => (r.id === siteKey ? { ...r, logo_url: url } : r)));
    autosave();
    showToast("Logo mis à jour — visible partout dans votre espace (ordinateur et mobile).");
  }
  const sitePhoto = partnerRows.find((r) => r.id === siteKey)?.photo_url ?? null;
  async function onSitePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Choisissez une image.");
    const blob = await compressImage(file);
    const path = `${siteKey}/photo-${Date.now()}.jpg`;
    const up = await supabase.storage.from("logos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (up.error) return showToast("Import de la photo impossible : " + up.error.message);
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("partners").update({ photo_url: url }).eq("id", siteKey);
    if (error) return showToast("Photo non enregistrée : " + error.message);
    setPartnerRows((prev) => prev.map((r) => (r.id === siteKey ? { ...r, photo_url: url } : r)));
    autosave();
    showToast("Photo enregistrée — le logisticien la verra sous l'adresse.");
  }

  const siteSwitch = (
    <div className="flex items-center gap-2 rounded-[40px] border border-[rgba(253,244,237,0.25)] bg-[rgba(253,244,237,0.1)] py-1.5 pr-2 pl-3.5">
      <Icon className="h-3.5 w-3.5 flex-none text-[var(--turquoise)]" sw={2}>{PIN}</Icon>
      <select value={siteKey} onChange={(e) => changeSite(e.target.value)} className="bg-transparent text-[12.5px] font-bold text-[var(--panel-fg)] outline-none">
        {Object.entries(sites).map(([k, s]) => <option key={k} value={k} className="text-[#111]">{s.label}</option>)}
      </select>
    </div>
  );

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-[13px] text-[var(--slate)]">Chargement de votre espace…</div>;
  }
  if (!site) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-[380px] rounded-[28px] bg-[var(--card)] px-7 py-8 text-center shadow-[var(--shadow)]">
          <span className="font-script text-[32px] leading-none">linkee</span>
          <h1 className="mt-4 font-display text-[22px] font-black">Aucun site rattaché</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--slate)]">Ce compte n&apos;est relié à aucun partenaire pour l&apos;instant. Contactez votre référent Linkee.</p>
          <button type="button" onClick={logout} className="mt-5 w-full rounded-[40px] bg-[var(--navy-deep)] py-3 font-display text-base font-bold text-[var(--panel-fg)]">Se déconnecter</button>
        </div>
      </div>
    );
  }

  /* ---- Device choice ---- */
  if (mode === "choice") {
    const choices: { m: Mode; title: string; sub: string; icon: ReactNode }[] = [
      { m: "mobile", title: "Sur mobile", sub: "Vue simplifiée : prochaines collectes et résumé de votre activité.", icon: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18 H13" /></> },
      { m: "desktop", title: "Sur ordinateur", sub: "Espace complet : fiche, tableau de bord détaillé, documents.", icon: <><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21 H16 M12 17 V21" /></> },
    ];
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-5">
        <div className="w-full max-w-[420px]">
          <div className="mb-[22px] text-center">
            <div className="flex justify-center"><Wordmark size="text-[32px]" color="text-[var(--navy)]" /></div>
            <p className="mt-3.5 mb-1 font-display text-xl font-extrabold">Comment consultez-vous votre espace ?</p>
            <p className="text-[12.5px] text-[var(--slate)]">Vous pourrez changer d&apos;avis à tout moment.</p>
          </div>
          <div className="flex flex-col gap-3">
            {choices.map((c) => (
              <button key={c.m} type="button" onClick={() => setMode(c.m)} className="flex w-full items-center gap-3.5 rounded-[18px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-[18px] py-4 text-left shadow-[var(--shadow)] hover:border-[var(--turquoise)]">
                <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl bg-[var(--input-bg)] text-[var(--turquoise)]"><Icon className="h-[22px] w-[22px]">{c.icon}</Icon></span>
                <span className="flex flex-col gap-[3px]">
                  <span className="font-display text-[15px] font-extrabold">{c.title}</span>
                  <span className="text-[11.5px] leading-[1.4] text-[var(--slate)]">{c.sub}</span>
                </span>
                {(c.m === "mobile") === isSmall && <span className="ml-auto flex-none rounded-[40px] bg-[var(--turquoise)] px-2 py-[3px] text-[9px] font-bold whitespace-nowrap text-[#04262e] uppercase">Recommandé</span>}
              </button>
            ))}
          </div>
          <button type="button" onClick={logout} className="mx-auto mt-5 block text-xs font-semibold text-[var(--slate)] underline">Déconnexion</button>
        </div>
      </div>
    );
  }

  const toastEl = toast && <div className="fixed bottom-[22px] left-1/2 z-[99] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[12.5px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)] print:hidden">{toast}</div>;

  /* ---- Mobile simplified ---- */
  if (mode === "mobile") {
    const okRate = dashM.collectes ? Math.round((dashM.ok / dashM.collectes) * 100) : 0;
    return (
      <div className="min-h-screen">
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-[var(--navy-deep)] px-6 py-3.5 text-[var(--panel-fg)] shadow-[var(--shadow)]">
          <Wordmark />
          {siteSwitch}
          <div className="flex-1" />
          <button type="button" onClick={logout} className="text-xs font-semibold text-[var(--panel-fg-dim)] hover:text-[var(--panel-fg)]">Déconnexion</button>
        </div>
        <div className="mx-auto max-w-[520px] px-4 pt-[18px] pb-12">
          <div className="mb-[18px] flex items-center gap-3">
            <Avatar site={site} size={42} />
            <div>
              <h2 className="mb-0.5 font-display text-[26px] leading-tight font-black">Bonjour, {site.name}</h2>
              <p className="text-[13px] text-[var(--slate)]">Résumé de votre activité Linkee.</p>
            </div>
          </div>

          <Card locked title="Informations de collecte" icon={LOCK} tag="Défini par Linkee">
            <div className="grid grid-cols-2 gap-3.5">
              <Info label="Créneau habituel" value={site.adminInfo.slot} />
              <Info label="Type de denrées" value={site.adminInfo.denree} />
            </div>
          </Card>

          <Card title="Résumé de votre activité" icon={GRID}>
            <GranToggle options={[["semaine", "Semaine"], ["mois", "Mois"], ["annee", "Année"]]} value={granM} onChange={(v) => setGranM(v as typeof granM)} />
            <p className="mb-2.5 text-[11.5px] text-[var(--slate)]">{dashM.periodLabel}</p>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile label="Volume" value={`${fmtNum(dashM.volume)} kg`} />
              <Tile label="Collectes" value={String(dashM.collectes)} />
              <Tile label="Réussite" value={`${okRate} %`} />
            </div>
          </Card>

          <Card title="Prochaines collectes" icon={CAL}>
            <UpcomingList site={site} siteKey={siteKey} requests={requests} />
            <ExcForm key={siteKey} siteName={site.name} onSubmit={addRequest} />
          </Card>

          <Card title="Historique des collectes" icon={CLOCK} note="Quantités collectées lors de vos dernières collectes.">
            {site.history.length ? site.history.map((h, i) => (
              <CollectRow key={i} date={h.date} time={h.time} note={h.denree} badge={h.status === "annulee" ? "Annulée" : `${h.kg} kg`} badgeCls={h.status === "annulee" ? "bg-[var(--critical-bg)] text-[var(--critical)]" : "bg-[var(--good-bg)] text-[var(--good)]"} />
            )) : <p className="text-[11.5px] text-[var(--slate)]">Aucun historique pour l&apos;instant.</p>}
          </Card>

          <button type="button" onClick={() => setMode("desktop")} className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] px-[18px] py-[13px] text-[13.5px] font-bold hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
            <Icon><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21 H16 M12 17 V21" /></Icon>
            Voir la version complète (ordinateur)
          </button>
        </div>
        {toastEl}
      </div>
    );
  }

  /* ---- Desktop (complete) ---- */
  const R = rse(rseSum.volume, rseSum.don); // RSE report figures for the chosen period
  const dashR = rse(dash.volume, dash.don);
  const kg = R.kg;
  const donValue = R.don;
  const tabs: { k: Tab; l: string; icon: ReactNode }[] = [
    { k: "activite", l: "Mon activité", icon: CAL },
    { k: "fiche", l: "Ma fiche", icon: STORE },
    { k: "dashboard", l: "Tableau de bord", icon: GRID },
    { k: "documents", l: "Mes documents", icon: DOC },
    { k: "valorisation", l: "Valorisation RSE", icon: GRID },
  ];
  const maxPct = Math.max(...dash.denrees.map((x) => x.pct), 1);

  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-[var(--navy-deep)] px-6 py-3.5 text-[var(--panel-fg)] shadow-[var(--shadow)]">
          <Wordmark />
          {siteSwitch}
          <div className="flex-1" />
          <div className="flex items-center gap-2.5 text-[12.5px]">
            <button type="button" onClick={() => setMode("mobile")} className="text-xs font-semibold text-[var(--panel-fg-dim)] hover:text-[var(--panel-fg)]">Vue simplifiée</button>
            <Avatar site={site} size={30} />
            <span>{site.name}</span>
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

        <div className="mx-auto max-w-[1080px] px-4 pt-[26px] pb-[60px] sm:px-6">
          {tab === "activite" && (
            <div>
              <PanelHead title="Mon activité" sub="Vos prochaines collectes et vos demandes exceptionnelles." />
              <Card locked title="Informations de collecte" icon={LOCK} tag="Défini par Linkee" note="Ces informations sont renseignées par votre référent Linkee — contactez-le pour toute mise à jour.">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Info label="Créneau habituel" value={site.adminInfo.slot} />
                  <Info label="Type de denrées" value={site.adminInfo.denree} />
                </div>
                <div className="mt-3">
                  <span className="text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Volume estimatif habituel</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {VOLUME_BUCKETS.map((b) => (
                      <span key={b} className={`rounded-[40px] border-[1.5px] px-[11px] py-1.5 text-[11px] font-bold ${b === site.adminInfo.volumeRange ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"}`}>{b.replace("/", " – ")}</span>
                    ))}
                  </div>
                </div>
                {site.adminInfo.comment && <div className="mt-3.5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--input-bg)] px-[13px] py-[11px] text-xs leading-[1.5] text-[var(--slate)]">{site.adminInfo.comment}</div>}
              </Card>
              <Card title="Prochaines collectes" icon={CAL} note="Planifiées par Linkee selon votre créneau habituel.">
                <UpcomingList site={site} siteKey={siteKey} requests={requests} />
                <ExcForm key={siteKey} siteName={site.name} onSubmit={addRequest} />
              </Card>
            </div>
          )}

          {tab === "fiche" && (
            <div>
              <PanelHead title="Ma fiche" sub="Modifiable directement par vous — Linkee voit vos mises à jour en temps réel." />
              <div className={`mb-3 flex items-center gap-[5px] text-[11.5px] text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}><CheckIcon />Modifications enregistrées</div>

              <Card title="Logo de votre structure" icon={<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 15 Q10 9 12 8 Q14 9 15.5 15" /><path d="M9.5 13 H14.5" /></>} note="Affiché en haut de votre espace, sur mobile et ordinateur.">
                <button type="button" onClick={() => logoInput.current?.click()} className={`flex h-28 w-28 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-full border-[1.5px] bg-[var(--input-bg)] text-[var(--slate)] ${site.logo ? "border-solid border-[var(--border)]" : "border-dashed border-[var(--border)]"}`}>
                  {site.logo ? <LogoContent logo={site.logo} /> : (
                    <>
                      <Icon className="h-6 w-6"><path d="M12 4 V15 M7 9 L12 4 L17 9" /><path d="M4 19 H20" /></Icon>
                      <span className="px-3 text-center text-[10.5px] leading-[1.3] font-semibold">Ajouter votre logo</span>
                    </>
                  )}
                </button>
                <input ref={logoInput} type="file" accept="image/*" hidden onChange={onLogo} />
              </Card>

              <Card title="Contacts" icon={<><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5 H13.5" /></>} note="Sur site, administratif, financier — autant que nécessaire.">
                <div className="mb-2.5 flex flex-col gap-2.5">
                  {site.contacts.map((c, idx) => {
                    const set = (f: keyof Contact, v: string) => patch({ contacts: site.contacts.map((x, i) => (i === idx ? { ...x, [f]: v } : x)) });
                    const small = `${fieldCls} !px-2.5 !py-2 !text-[12.5px]`;
                    return (
                      <div key={idx} className="grid grid-cols-2 items-center gap-2 lg:grid-cols-[120px_1fr_1fr_1fr]">
                        <select className={small} value={c.type} onChange={(e) => set("type", e.target.value)}>{Array.from(new Set(["Sur site", "Administratif", "Financier", c.type])).map((t) => <option key={t}>{t}</option>)}</select>
                        <input className={small} value={c.nom} placeholder="Nom" onChange={(e) => set("nom", e.target.value)} />
                        <input className={small} value={c.tel} placeholder="Téléphone" onChange={(e) => set("tel", e.target.value)} />
                        <input className={small} value={c.mail} placeholder="Email" onChange={(e) => set("mail", e.target.value)} />
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => patch({ contacts: [...site.contacts, { type: "Sur site", nom: "", tel: "", mail: "" }] })} className="rounded-[14px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-[9px] text-[12.5px] font-bold hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">+ Ajouter un contact</button>
              </Card>

              <Card title="Conditions d'accès" icon={<><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="9" cy="8" r="1" /><circle cx="15" cy="8" r="1" /></>}>
                <div className="flex flex-wrap gap-2">
                  {ACCESS_OPTIONS.map((o) => <ChipToggle key={o.k} label={o.l} checked={!!site.access[o.k]} onChange={(v) => patch({ access: { ...site.access, [o.k]: v } })} />)}
                </div>
                <div className="mt-3"><label className={labelCls}>Détails (texte libre)</label><textarea className={fieldCls} rows={2} value={site.accessNote} onChange={(e) => patch({ accessNote: e.target.value })} /></div>
              </Card>

              <Card title="Horaires d'ouverture" icon={CLOCK} note="Un jour fermé grise automatiquement ce créneau dans le planning Linkee.">
                <div className="flex flex-col">
                  {DAYS.map((d) => {
                    const h = site.hours[d.k];
                    const setH = (v: Hours) => patch({ hours: { ...site.hours, [d.k]: v } });
                    return (
                      <div key={d.k} className="grid grid-cols-[70px_auto_1fr_1fr] items-center gap-2.5 border-b border-[var(--border)] py-2 last:border-b-0 sm:grid-cols-[90px_auto_1fr_1fr]">
                        <span className="text-[12.5px] font-bold">{d.l}</span>
                        <label className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-[var(--slate)]">
                          <input type="checkbox" checked={!h} onChange={(e) => setH(e.target.checked ? null : { open: "09:00", close: "18:00" })} className="h-[15px] w-[15px] accent-[var(--critical)]" />
                          Fermé
                        </label>
                        <input type="time" disabled={!h} className={`${fieldCls} !px-2 !py-1.5 !text-xs disabled:opacity-35`} value={h?.open ?? "09:00"} onChange={(e) => h && setH({ ...h, open: e.target.value })} />
                        <input type="time" disabled={!h} className={`${fieldCls} !px-2 !py-1.5 !text-xs disabled:opacity-35`} value={h?.close ?? "18:00"} onChange={(e) => h && setH({ ...h, close: e.target.value })} />
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Denrées habituellement données" icon={<><path d="M4 8 L8 4 H16 L20 8" /><rect x="4" y="8" width="16" height="11" rx="1.5" /></>}>
                <div className="flex flex-wrap gap-2">
                  {DENREE_OPTIONS.map((d) => <ChipToggle key={d} label={d} checked={!!site.denrees[d]} onChange={(v) => patch({ denrees: { ...site.denrees, [d]: v } })} />)}
                </div>
              </Card>

              <Card title="Photo du lieu de collecte" icon={<><path d="M4 8 L7 4 H17 L20 8" /><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="12" cy="14" r="3.2" /></>} note="Aide le logisticien à repérer l'endroit exact (porte arrière, quai, etc.).">
                <button type="button" onClick={() => sitePhotoInput.current?.click()} className={`flex aspect-[4/3] w-full max-w-[280px] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-[1.5px] bg-[var(--input-bg)] text-[var(--slate)] ${sitePhoto ? "border-solid border-[var(--border)]" : "border-dashed border-[var(--border)]"}`}>
                  {sitePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sitePhoto} alt="Lieu de collecte" className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <Icon className="h-7 w-7"><path d="M4 8 L7 4 H17 L20 8" /><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="12" cy="14" r="3.2" /></Icon>
                      <span className="text-xs font-semibold">Ajouter une photo</span>
                    </>
                  )}
                </button>
                <input ref={sitePhotoInput} type="file" accept="image/*" hidden onChange={onSitePhoto} />
              </Card>
            </div>
          )}

          {tab === "dashboard" && (
            <div>
              <PanelHead title="Tableau de bord" sub="Vos volumes et collectes pour le site sélectionné en haut de page." />
              <GranToggle options={[["semaine", "Semaine"], ["mois", "Mois"], ["tout", "Depuis le début"]]} value={gran} onChange={(v) => setGran(v as typeof gran)} />
              <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                <Tile label="Volume collecté" value={`${fmtNum(dash.volume)} kg`} sub={dash.periodLabel} />
                <Tile label="Collectes" value={String(dash.collectes)} sub={`${dash.ok} réalisées · ${dash.annulees} annulées`} />
                <Tile label="Taux de réussite" value={`${dash.collectes ? Math.round((dash.ok / dash.collectes) * 100) : 0} %`} sub="sur la période" />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
                <Card title="Évolution du volume collecté" note="Volume collecté par période"><EvoChart data={dash.evo} /></Card>
                <Card title="Répartition par type de denrée" note="Sur la période sélectionnée">
                  <div className="flex flex-col gap-3">
                    {dash.denrees.map((x) => (
                      <div key={x.k} className="grid grid-cols-[110px_1fr_64px] items-center gap-2.5">
                        <span className="text-xs font-semibold">{CAT_LABELS[x.k]}</span>
                        <span className="h-[11px] overflow-hidden rounded-md bg-[var(--track)]"><span className="block h-full rounded-md" style={{ width: `${Math.round((x.pct / maxPct) * 100)}%`, background: CAT_COLORS[x.k] }} /></span>
                        <span className="text-right text-[11.5px] font-semibold text-[var(--slate)]">{x.pct}% · {x.kg}kg</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
              <div className="mt-8 mb-3.5 flex items-center gap-3.5">
                <h2 className="font-display text-[20px] font-black whitespace-nowrap text-[var(--navy)]">Valorisation RSE</h2>
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <p className="mb-3 text-[12px] text-[var(--slate)]">
                Mise à jour à chaque collecte validée ({dash.periodLabel.toLowerCase()}).{dash.customShare > 0 ? ` ${dash.customShare} % du volume est valorisé avec vos prix unitaires, le reste à ${DEFAULT_EUR_PER_KG} €/kg.` : ` Valeur calculée à ${DEFAULT_EUR_PER_KG} €/kg — renseignez vos prix dans l'onglet « Valorisation ».`}
              </p>
              <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
                <Tile label="Valeur des dons" value={`${fmtNum(dashR.don)} €`} />
                <Tile label="Défiscalisation (60 %)" value={`${fmtNum(dashR.defisc)} €`} />
                <Tile label="Valeur sociale (×2)" value={`${fmtNum(dashR.social)} €`} />
                <Tile label="Repas distribués" value={fmtNum(dashR.repas)} />
                <Tile label="CO₂ évité" value={`${dashR.co2.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`} />
                <Tile label="Déchets évités" value={`${fmtNum(dashR.dechets)} kg`} />
              </div>
              <Card title="Bilan RSE" note="Génère votre bilan d'impact RSE officiel Linkee (poids sauvé, valeur du don, défiscalisation, impact social et environnemental) — utilisez « Enregistrer en PDF » dans la fenêtre d'impression de votre navigateur.">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-[var(--slate)]">Du</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[12.5px]" />
                  <label className="text-xs text-[var(--slate)]">au</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[12.5px]" />
                  <button type="button" onClick={() => window.print()} className="flex items-center gap-[7px] rounded-[40px] bg-[var(--navy-deep)] px-[18px] py-[11px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]">
                    <Icon className="h-[15px] w-[15px]" sw={2}><path d="M12 4 V15 M7 10 L12 15 L17 10" /><path d="M4 19 H20" /></Icon>
                    Générer mon bilan RSE
                  </button>
                </div>
              </Card>
            </div>
          )}

          {tab === "documents" && (
            <div>
              <PanelHead title="Mes documents" sub="Un porte-documents partagé avec Linkee : listing détaillé de vos produits, fiches techniques, conventions…" />
              {siteKey && <PartnerDocuments key={siteKey} partnerId={siteKey} role="partenaire" />}
            </div>
          )}

          {tab === "valorisation" && (
            <div>
              <PanelHead title="Valorisation RSE" sub="Vos sous-catégories de produits et leur valeur unitaire : elles servent à calculer la valeur de vos dons." />
              {siteKey && <PartnerValuation key={siteKey} partnerId={siteKey} />}
            </div>
          )}
        </div>
      </div>

      {/* ---- RSE print sheet ---- */}
      <div className="hidden bg-[#FBF4EC] p-[26px] text-[#001641] print:block">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="font-script text-[22px]">linkee</span>
          <span className="h-[34px] w-[34px] overflow-hidden rounded-full">{site.logo && <LogoContent logo={site.logo} />}</span>
        </div>
        <h1 className="mb-1.5 font-display text-[26px] font-black uppercase">Bilan d&apos;impact <span className="text-[#4FC1D6]">RSE</span></h1>
        <div className="mb-4 flex gap-7 border-y-[1.5px] border-[#EADFD2] py-2.5">
          <div><span className="block text-[9.5px] font-bold tracking-[0.04em] text-[#4D5C7A] uppercase">Période du</span><span className="mt-0.5 block text-[12.5px] font-bold">{from || "—"} au {to || "—"}</span></div>
          <div><span className="block text-[9.5px] font-bold tracking-[0.04em] text-[#4D5C7A] uppercase">Partenaire</span><span className="mt-0.5 block text-[12.5px] font-bold">{site.name}</span></div>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-3">
          {[
            { bg: "#FBE3D0", icon: "⚖️", v: `${fmtNum(kg)} kg`, l: "Poids total sauvé" },
            { bg: "#FCEFC2", icon: "🤝", v: `${fmtNum(donValue)} €`, l: "Valeur totale du don" },
            { bg: "#DCEFDD", icon: "🧾", v: `${fmtNum(R.defisc)} €`, l: "Défiscalisation accessible (60%)" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl px-4 py-3.5 text-center" style={{ background: s.bg }}>
              <div className="mb-1 text-xl">{s.icon}</div>
              <div className="font-display text-2xl font-black">{s.v}</div>
              <div className="mt-0.5 text-[9px] font-bold tracking-[0.03em] text-[#4D5C7A] uppercase">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          {[
            { icon: "🍽️", l: "Impact social", v: `${R.repas} repas`, s: "complets distribués à des étudiants précarisés." },
            { icon: "🚚", l: "Logistique", v: `${rseSum.ok} collectes`, s: "solidaires réalisées sur la période par nos équipes." },
          ].map((s) => (
            <div key={s.l} className="flex items-start gap-2.5 rounded-[14px] border border-[#EADFD2] bg-[#FDFBF8] px-3.5 py-3">
              <span className="text-lg">{s.icon}</span>
              <div>
                <div className="text-[9px] font-bold tracking-[0.03em] text-[#4FC1D6] uppercase">{s.l}</div>
                <div className="font-display text-[15px] font-extrabold">{s.v}</div>
                <div className="mt-0.5 text-[9.5px] leading-[1.35] text-[#4D5C7A]">{s.s}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mb-4 rounded-[14px] border border-[#EADFD2] bg-[#FDFBF8] px-3.5 py-3">
          <div className="mb-2.5 text-center text-[9.5px] font-bold tracking-[0.04em] text-[#4D5C7A] uppercase">Détails de vos dons</div>
          <div className="grid grid-cols-5 gap-2">
            {rseSum.denrees.map((x) => (
              <div key={x.k} className="text-center">
                <div className="font-display text-base font-black" style={{ color: CAT_PRINT[x.k] }}>{x.pct}%</div>
                <div className="text-[8px] font-bold text-[#4D5C7A] uppercase">{CAT_LABELS[x.k]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 font-display text-[13px] font-extrabold">Impact social</div>
            <RseItem v={`${fmtNum(R.social)} €`} l="Valeur sociale créée" n="Estimation de l'augmentation directe générée pour le pouvoir d'achat des étudiants bénéficiaires de vos dons." />
            <RseItem v="100%" l="Des dons redistribués" n="Redistribués lors de nos distributions alimentaires à destination des étudiants et personnes en situation de précarité." />
          </div>
          <div>
            <div className="mb-2 font-display text-[13px] font-extrabold">Impact environnemental</div>
            <RseItem v={`${R.co2.toFixed(2)} T`} l="De CO² évitées" n="Estimation des équivalents CO² évités grâce à la lutte quotidienne contre le gaspillage." />
            <RseItem v={`${fmtNum(R.dechets)} Kg`} l="De déchets évités" n="Estimation du nombre de kg de déchets évités." />
          </div>
        </div>
        <div className="rounded-[10px] bg-[#001641] p-[9px] text-center text-[10px] font-semibold text-[#FDF4ED]">Certifié par Linkee · Conforme à la loi AGEC · www.linkee.co</div>
      </div>
      {toastEl}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
function RseItem({ v, l, n }: { v: string; l: string; n: string }) {
  return (
    <div className="mb-2.5 flex flex-col">
      <span className="font-display text-xl font-black">{v}</span>
      <span className="text-[9px] font-bold tracking-[0.03em] text-[#4FC1D6] uppercase">{l}</span>
      <span className="mt-0.5 text-[9px] leading-[1.4] text-[#4D5C7A]">{n}</span>
    </div>
  );
}
