"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PartnerDocuments from "@/components/partner/PartnerDocuments";

type Contact = { type: string; nom: string; tel: string; mail: string };
type Hours = { open: string; close: string } | null;
type Fiche = Record<string, unknown>;
type BeneficiaryRow = { id: string; name: string; category: string | null; address: string | null; city_id: string; fiche: Fiche | null };
type CollecteRow = { id: string; beneficiary_id: string | null; scheduled_date: string; scheduled_time: string | null; status: string; collecte_items: { denree: string | null; kg: number | string | null }[] | null };

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

function CollectRow({ date, note, badge, badgeCls }: { date: string; note: string; badge: string; badgeCls?: string }) {
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
      <span className={`flex-none rounded-[40px] px-2.5 py-[5px] text-[10px] font-bold whitespace-nowrap uppercase ${badgeCls ?? "bg-[var(--track)] text-[var(--slate)]"}`}>{badge}</span>
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

type Tab = "livraisons" | "fiche" | "documents";

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
        supabase.from("beneficiaries").select("id,name,category,address,city_id,fiche").in("id", ids).is("deleted_at", null).order("name"),
        supabase.from("collectes").select("id,beneficiary_id,scheduled_date,scheduled_time,status,collecte_items!collecte_id(denree,kg)").in("beneficiary_id", ids).order("scheduled_date", { ascending: false }).limit(300),
      ]);
      if (b.error) showToast("Chargement impossible : " + b.error.message + " (la migration 030 est-elle passée ?)");
      const list = (b.data ?? []) as BeneficiaryRow[];
      setRows(list);
      if (list[0]) setCurrentId(list[0].id);
      setColRows((c.data ?? []) as unknown as CollecteRow[]);
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
  const network = (fiche.network as string) ?? "";
  const description = (fiche.description as string) ?? "";

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
            <Card title="Historique des livraisons" icon={CLOCK} note="Quantités reçues lors de vos dernières livraisons Linkee.">
              {history.length ? (
                history.map((r) => {
                  const s = summarizeItems(r.collecte_items);
                  return <CollectRow key={r.id} date={r.scheduled_date} note={s.denree} badge={`${s.kg} kg`} badgeCls="bg-[var(--good-bg)] text-[var(--good)]" />;
                })
              ) : (
                <p className="text-[11.5px] text-[var(--slate)]">Aucun historique pour l&apos;instant.</p>
              )}
            </Card>
          </>
        )}

        {tab === "fiche" && (
          <>
            <Card title="Informations générales" icon={STORE}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Info label="Nom" value={current.name} />
                <Info label="Type de structure" value={structureType || "Non renseigné"} />
                <Info label="Adresse" value={current.address || "Non renseignée"} />
                <Info label="Statut" value={statut || "Non renseigné"} />
                <Info label="Réseau / fédération" value={network || "—"} />
                <Info label="Nombre de bénéficiaires" value={beneficiaryCount || "Non renseigné"} />
              </div>
              {description && <p className="mt-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">{description}</p>}
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

            {contacts.length > 0 && (
              <Card title="Contacts" icon={STORE}>
                <div className="flex flex-col gap-2">
                  {contacts.map((c, i) => (
                    <div key={i} className="rounded-[12px] border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[12.5px]">
                      <div className="font-bold text-[var(--navy)]">{c.nom || "Sans nom"} {c.type && <span className="font-normal text-[var(--slate)]">— {c.type}</span>}</div>
                      <div className="mt-0.5 text-[var(--slate)]">{[c.tel, c.mail].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {comment && (
              <Card title="Commentaires de l'équipe Linkee" icon={STORE}>
                <p className="text-[12.5px] leading-[1.5] text-[var(--slate)]">{comment}</p>
              </Card>
            )}

            <Card title="Demander une modification" icon={STORE} note="Cette fiche est gérée par l'équipe Linkee. Pour signaler un changement (adresse, horaires, contact…), envoyez une demande ci-dessous.">
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
