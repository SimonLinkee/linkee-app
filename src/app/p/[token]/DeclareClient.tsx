"use client";

import { useEffect, useState } from "react";
import LinkeeLogo from "@/components/LinkeeLogo";
import HalfHourSelect from "@/components/HalfHourSelect";
import { CRENEAUX_DAYS, type Creneaux } from "@/lib/creneaux";

// Ce que voit le partenaire en ouvrant son lien : pas de compte. Deux chemins — demander une collecte exceptionnelle,
// ou déclarer un don (quantités et/ou bon de livraison / fichier Excel, rattaché à une collecte).

type Coll = { id: string; date: string; time: string | null; kind: string; done: boolean };
type Info = {
  name: string;
  category: string | null;
  denrees: string[];
  creneaux: Creneaux | null;
  creneauxText: string;
  upcoming: Coll[];
  recent: Coll[];
  city: { name: string; phone: string | null; email: string | null };
};
type View = "home" | "exc" | "don" | "sent-exc" | "sent-don";

const CATEGORIES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie", "Bacs gastronomiques alimentaires", "Autres"];
const fieldCls = "w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[14px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1 block text-[11px] font-bold tracking-[0.04em] text-[var(--slate)] uppercase";
const boxCls = "rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4";
const hm = (t: string) => t.replace(":", "h");
const dayLabel = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Les types de dons de la fiche → la catégorie de pesée la plus proche
const toCategory = (d: string) => (CATEGORIES.includes(d) ? d : d === "Produits surgelés" ? "Produits frais" : d === "Boissons" || d === "Non alimentaire" ? "Autres" : "Autres");

export default function DeclareClient({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [sentText, setSentText] = useState("");

  useEffect(() => {
    let off = false;
    fetch(`/api/p/${token}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (off) return;
        if (!r.ok) setError(j.error ?? "Ce lien n'est pas valable.");
        else setInfo(j as Info);
      })
      .catch(() => !off && setError("Impossible de charger la page. Vérifiez votre connexion."));
    return () => {
      off = true;
    };
  }, [token]);

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--navy)]">
      <div className="mx-auto flex min-h-screen max-w-[520px] flex-col bg-[var(--bg)] shadow-[0_0_40px_-20px_rgba(0,0,0,0.3)]">
        <header className="bg-[var(--navy-deep)] px-5 pt-5 pb-4 text-[var(--panel-fg)]">
          <LinkeeLogo h={26} light />
          {view !== "home" && info && (
            <button type="button" onClick={() => go("home")} className="mt-3 text-[13px] font-semibold opacity-90">
              ← Retour
            </button>
          )}
          <h1 className="mt-2 font-display text-[24px] leading-tight font-black">
            {error ? "Lien non valable" : !info ? "Chargement…" : view === "home" ? `Bonjour, ${info.name}` : view === "exc" ? "Collecte exceptionnelle" : view === "don" ? "Déclarer un don" : "Merci !"}
          </h1>
          {info && view === "home" && <p className="mt-0.5 text-[13px] opacity-80">Votre espace : pas de compte à créer. Que souhaitez-vous faire ?</p>}
          {info && view === "exc" && <p className="mt-0.5 text-[13px] opacity-80">Dites-nous quand et quoi : votre demande est prise en compte tout de suite.</p>}
          {info && view === "don" && <p className="mt-0.5 text-[13px] opacity-80">Saisissez les quantités, joignez un fichier, ou les deux.</p>}
        </header>

        <main className="flex flex-1 flex-col gap-3.5 px-4 pt-4 pb-8">
          {error && <div className={`${boxCls} text-[14px] text-[var(--slate)]`}>{error}</div>}
          {info && view === "home" && <Home info={info} go={go} />}
          {info && view === "exc" && <ExcForm token={token} info={info} onSent={(t) => { setSentText(t); go("sent-exc"); }} />}
          {info && view === "don" && <DonForm token={token} info={info} onSent={(t) => { setSentText(t); go("sent-don"); }} />}
          {info && (view === "sent-exc" || view === "sent-don") && (
            <>
              <div className="rounded-[16px] bg-[var(--good-bg)] p-4 text-[14px] leading-[1.5] font-semibold text-[var(--good)]">✔ {sentText}</div>
              <button type="button" onClick={() => go("home")} className="min-h-[50px] rounded-[40px] bg-[var(--navy-deep)] px-5 font-display text-[15px] font-bold text-[var(--panel-fg)]">
                Retour à l&apos;accueil
              </button>
            </>
          )}
          {info && <Contact info={info} />}
        </main>
      </div>
    </div>
  );
}

function Contact({ info }: { info: Info }) {
  const c = info.city;
  if (!c.phone && !c.email) return null;
  return (
    <p className="mt-auto pt-2 text-center text-[12px] text-[var(--slate)]">
      Un souci ? Contactez l&apos;antenne{c.name ? ` de ${c.name}` : ""}
      {c.phone ? ` · ${c.phone}` : ""}
      {c.email ? ` · ${c.email}` : ""}
    </p>
  );
}

function Home({ info, go }: { info: Info; go: (v: View) => void }) {
  const next = info.upcoming[0];
  const days = info.creneaux ? CRENEAUX_DAYS.flatMap((d) => (info.creneaux![d.k] ?? []).map((s) => ({ d: d.l, h: `${hm(s.open)} – ${hm(s.close)}`, p: s.weekParity }))) : [];
  return (
    <>
      <section className={boxCls}>
        <h2 className="mb-1.5 text-[11px] font-bold tracking-[0.07em] text-[var(--slate)] uppercase">Vos collectes habituelles</h2>
        {days.length > 0 ? (
          days.map((x, i) => (
            <div key={i} className="flex justify-between gap-2 py-0.5 text-[14px]">
              <b>{x.d}</b>
              <span className="text-[var(--slate)]">
                {x.h}
                {x.p ? ` · semaines ${x.p === "even" ? "paires" : "impaires"}` : ""}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[14px] text-[var(--slate)]">{info.creneauxText || "Pas de créneau régulier : vous demandez une collecte quand vous en avez besoin."}</p>
        )}
      </section>
      <section className={boxCls}>
        <h2 className="mb-1.5 text-[11px] font-bold tracking-[0.07em] text-[var(--slate)] uppercase">Ce que vous donnez</h2>
        {info.denrees.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {info.denrees.map((d) => (
              <span key={d} className="rounded-[40px] bg-[var(--turquoise-bg,#e3f5f9)] px-3 py-1 text-[12.5px] font-semibold text-[#0e6b7a]">{d}</span>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-[var(--slate)]">{info.category ?? "Non renseigné"}</p>
        )}
      </section>
      {next && (
        <div className="flex items-center gap-3 rounded-[14px] bg-[#e3f5f9] px-3.5 py-3 text-[14px] text-[#04262e]">
          <span className="text-[22px]">🚚</span>
          <div>
            <b className="block capitalize">Prochaine collecte : {dayLabel(next.date)}</b>
            {next.time ? <span>vers {hm(next.time)}</span> : <span>horaire à confirmer par l&apos;antenne</span>}
          </div>
        </div>
      )}
      <button type="button" onClick={() => go("exc")} className="flex min-h-[72px] items-center gap-3.5 rounded-[18px] bg-[#eb6834] px-4 py-3.5 text-left text-white">
        <span className="flex h-[44px] w-[44px] flex-none items-center justify-center rounded-full bg-white/25 text-[22px]">📅</span>
        <span>
          <strong className="block font-display text-[17px]">Un don à nous confier ?</strong>
          <span className="text-[12.5px] opacity-90">Demandez une collecte exceptionnelle : jour, heure, produits</span>
        </span>
      </button>
      <button type="button" onClick={() => go("don")} className="flex min-h-[72px] items-center gap-3.5 rounded-[18px] bg-[var(--navy-deep)] px-4 py-3.5 text-left text-[var(--panel-fg)]">
        <span className="flex h-[44px] w-[44px] flex-none items-center justify-center rounded-full bg-white/20 text-[22px]">📦</span>
        <span>
          <strong className="block font-display text-[17px]">Un don à déclarer (Cerfa) ?</strong>
          <span className="text-[12.5px] opacity-90">Déclarez vos quantités ou joignez votre bon de livraison</span>
        </span>
      </button>
    </>
  );
}

function ExcForm({ token, info, onSent }: { token: string; info: Info; onSent: (text: string) => void }) {
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10)); // demain par défaut
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("12:00");
  const [denrees, setDenrees] = useState<string[]>(info.denrees.slice(0, 1));
  const [volume, setVolume] = useState("");
  const [unit, setUnit] = useState("kg");
  const [reason, setReason] = useState("Surplus ponctuel");
  const [access, setAccess] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = [...info.denrees, ...(info.denrees.includes("Autre") ? [] : ["Autre"])];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const r = await fetch(`/api/p/${token}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, from, to, denrees, volume: parseFloat(volume.replace(",", ".")) || 0, unit, reason, access, contactName, contactPhone }),
    }).catch(() => null);
    setBusy(false);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return setErr(j.error ?? "Envoi impossible. Vérifiez votre connexion et réessayez.");
    onSent(`Votre demande est prise en compte pour le ${dayLabel(date)}, de ${hm(from)} à ${hm(to)}. L'équipe de l'antenne est prévenue et prépare la collecte.`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div>
        <label className={labelCls}>Jour souhaité</label>
        <input type="date" required min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>De</label>
          <HalfHourSelect value={from} onChange={setFrom} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>À</label>
          <HalfHourSelect value={to} onChange={setTo} className={fieldCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Ce que vous avez à donner</label>
        <div className="flex flex-wrap gap-1.5">
          {options.map((d) => {
            const on = denrees.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDenrees(on ? denrees.filter((x) => x !== d) : [...denrees, d])}
                className={`rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold ${on ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>Volume estimé</label>
          <input inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="40" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Unité</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldCls}>
            <option value="kg">kg</option>
            <option value="cartons">cartons / bacs</option>
            <option value="pièces">pièces</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Pourquoi ?</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls}>
          <option>Surplus ponctuel</option>
          <option>Fin de saison / fermeture</option>
          <option>Événement</option>
          <option>Autre</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Où et comment accéder ?</label>
        <textarea rows={3} value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Quai arrière, sonner à l'interphone, code…" className={fieldCls} maxLength={300} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>Contact sur place</label>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={fieldCls} maxLength={80} />
        </div>
        <div>
          <label className={labelCls}>Téléphone</label>
          <input type="tel" required value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={fieldCls} maxLength={30} />
        </div>
      </div>
      {err && <div className="rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--critical)]">{err}</div>}
      <button type="submit" disabled={busy} className="min-h-[52px] rounded-[40px] bg-[#eb6834] px-5 font-display text-[16px] font-bold text-white disabled:opacity-60">
        {busy ? "Envoi…" : "Envoyer ma demande"}
      </button>
    </form>
  );
}

type Line = { denree: string; kg: string };

function DonForm({ token, info, onSent }: { token: string; info: Info; onSent: (text: string) => void }) {
  const choices = [...info.upcoming.filter((c) => c.date <= todayIso()), ...info.recent, ...info.upcoming.filter((c) => c.date > todayIso())];
  // par défaut : la collecte la plus récente (aujourd'hui ou avant), sinon la prochaine
  const [collecteId, setCollecteId] = useState<string>(() => info.recent[0]?.id ?? info.upcoming[0]?.id ?? "");
  const first = toCategory(info.denrees[0] ?? "");
  const [lines, setLines] = useState<Line[]>([{ denree: first, kg: "" }]);
  const [value, setValue] = useState(""); // valeur totale du don, en euros
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const label = (c: Coll) => `${dayLabel(c.date)}${c.time ? ` · ${hm(c.time)}` : ""} (${c.done ? "collecte faite" : c.date > todayIso() ? "à venir" : "collecte du jour ou passée"})`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const items = lines.map((l) => ({ denree: l.denree, kg: parseFloat(l.kg.replace(",", ".")) || 0 })).filter((l) => l.kg > 0);
    const val = parseFloat(value.replace(",", ".").replace(/\s/g, "")) || 0;
    if (!items.length && !files.length && !(val > 0)) return setErr("Indiquez au moins une quantité, la valeur du don ou joignez un fichier.");
    setBusy(true);
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ collecteId: collecteId || null, items, value: val > 0 ? val : null, note, contact }));
    files.forEach((f) => fd.append("files", f));
    const r = await fetch(`/api/p/${token}/don`, { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return setErr(j.error ?? "Envoi impossible. Vérifiez votre connexion et réessayez.");
    const total = items.reduce((s, i) => s + i.kg, 0);
    onSent(`Votre don est déclaré${total > 0 ? ` (${Math.round(total * 10) / 10} kg` : ""}${val > 0 ? `${total > 0 ? ", " : " ("}valeur ${Math.round(val * 100) / 100} €` : ""}${total > 0 || val > 0 ? ")" : ""}${files.length ? `, avec ${files.length} fichier${files.length > 1 ? "s" : ""}` : ""}. Le logisticien retrouvera ces quantités à la collecte.`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div>
        <label className={labelCls}>À quelle collecte correspond ce don ?</label>
        <select value={collecteId} onChange={(e) => setCollecteId(e.target.value)} className={fieldCls}>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>{label(c)}</option>
          ))}
          <option value="">Autre date / dépôt direct</option>
        </select>
      </div>
      <section className={boxCls}>
        <h2 className="mb-2 text-[11px] font-bold tracking-[0.07em] text-[var(--slate)] uppercase">Ce que vous donnez</h2>
        <div className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={l.denree} onChange={(e) => setLine(i, { denree: e.target.value })} className={`${fieldCls} flex-1`}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input inputMode="decimal" placeholder="kg" value={l.kg} onChange={(e) => setLine(i, { kg: e.target.value })} className={`${fieldCls} !w-[84px] text-center`} aria-label="Poids en kg" />
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="Retirer cette ligne" className="flex h-8 w-8 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)]">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines((ls) => [...ls, { denree: first, kg: "" }])} className="mt-2.5 rounded-[40px] border-[1.5px] border-dashed border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--slate)]">
          + Ajouter un type de produit
        </button>
        <p className="mt-2 text-[12px] text-[var(--slate)]">Poids en kilos. Une estimation suffit : le logisticien vérifie à la collecte.</p>
      </section>
      <section className={`${boxCls} !border-[var(--good)]`}>
        <h2 className="mb-1 text-[11px] font-bold tracking-[0.07em] text-[var(--slate)] uppercase">Valeur totale du don</h2>
        <div className="relative">
          <input inputMode="decimal" placeholder="0" value={value} onChange={(e) => setValue(e.target.value)} className={`${fieldCls} pr-10 text-[18px] font-bold`} aria-label="Valeur totale du don en euros" />
          <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[16px] font-bold text-[var(--slate)]">€</span>
        </div>
        <p className="mt-1.5 text-[12px] text-[var(--slate)]">La valeur estimée de l&apos;ensemble du don, en euros (prix d&apos;achat ou prix de vente). Elle sert à établir votre reçu fiscal (Cerfa).</p>
      </section>
      <section className={boxCls}>
        <h2 className="mb-2 text-[11px] font-bold tracking-[0.07em] text-[var(--slate)] uppercase">Bon de livraison ou fichier Excel</h2>
        <label className="block cursor-pointer rounded-[14px] border-2 border-dashed border-[#b9c6d8] bg-[var(--input-bg)] px-3 py-4 text-center">
          <b className="block text-[14px]">Touchez pour ajouter un fichier</b>
          <small className="text-[12px] text-[var(--slate)]">PDF, photo du bon, Excel (.xlsx, .csv) · 10 Mo max par fichier</small>
          <input type="file" multiple hidden accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.ods,image/*" onChange={(e) => setFiles((fs) => [...fs, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
        </label>
        {files.map((f, i) => (
          <div key={i} className="mt-1.5 flex items-center gap-2 rounded-[10px] bg-[#e3f5f9] px-2.5 py-1.5 text-[13px] text-[#04262e]">
            📎 <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <button type="button" onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))} aria-label="Retirer le fichier" className="px-1 text-[16px]">×</button>
          </div>
        ))}
        <p className="mt-2 text-[12px] text-[var(--slate)]">Si vous joignez un fichier, la saisie des quantités reste facultative.</p>
      </section>
      <div>
        <label className={labelCls}>Un commentaire ? (facultatif)</label>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Précisions, DLC courtes, produits à part…" className={fieldCls} maxLength={500} />
      </div>
      <div>
        <label className={labelCls}>Votre nom (facultatif)</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} className={fieldCls} maxLength={80} />
      </div>
      {err && <div className="rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--critical)]">{err}</div>}
      <button type="submit" disabled={busy} className="min-h-[52px] rounded-[40px] bg-[var(--navy-deep)] px-5 font-display text-[16px] font-bold text-[var(--panel-fg)] disabled:opacity-60">
        {busy ? "Envoi…" : "Déclarer mon don"}
      </button>
    </form>
  );
}
