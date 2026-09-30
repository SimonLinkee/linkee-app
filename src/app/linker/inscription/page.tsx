"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CharSvg from "@/components/linker/CharSvg";
import { CH, FRUITS, LEGUMES, characterSVG, type CharKey } from "@/lib/linker/characters";

type City = { id: string; name: string; color: string };
type Draft = { email: string; password: string; name: string; phone: string; cityId: string; character: CharKey };
const DRAFT_KEY = "linkee.linker.signup_draft";
const fieldCls = "h-[52px] w-full rounded-[16px] border-2 border-[var(--border)] bg-[var(--input-bg)] px-4 text-[15px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1.5 block text-[12.5px] font-bold text-[var(--navy)]";

export default function LinkerInscriptionPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "form" | "sentEmail" | "finish">("checking");
  const [cities, setCities] = useState<City[]>([]);
  const [d, setD] = useState<Draft>({ email: "", password: "", name: "", phone: "", cityId: "", character: "fraise" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("cities").select("id,name,color").order("name");
      const list = ((c ?? []) as City[]).map((x) => ({ ...x, color: x.color || "#2a78d6" }));
      setCities(list);
      setD((x) => ({ ...x, cityId: x.cityId || list[0]?.id || "" }));

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        try {
          const raw = window.localStorage.getItem(DRAFT_KEY);
          if (raw) setD((x) => ({ ...x, ...JSON.parse(raw) }));
        } catch { /* ignore */ }
        return setPhase("form");
      }
      const [prof, lk] = await Promise.all([
        supabase.from("profiles").select("role,full_name,phone").eq("id", auth.user.id).maybeSingle(),
        supabase.from("linkers").select("id").eq("id", auth.user.id).maybeSingle(),
      ]);
      // only send them onward once BOTH the role and the Linker row are in place — checking role alone caused an
      // accueil ⇄ inscription loop for an account stuck mid-signup (role set, linkers row missing)
      if (prof.data?.role === "linker" && lk.data) { window.location.href = "/linker/accueil"; return; }
      if (prof.data && prof.data.role !== "en_attente" && prof.data.role !== "linker") { window.location.href = "/"; return; }
      // signed in, not finished yet (role still en_attente, or role is linker but the fiche is missing): let them (re)finish
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw) setD((x) => ({ ...x, ...JSON.parse(raw) }));
      } catch { /* ignore */ }
      setD((x) => ({ ...x, name: x.name || prof.data?.full_name || "", phone: x.phone || prof.data?.phone || "" }));
      setPhase("finish");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveDraft(next: Draft) {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: next.name, phone: next.phone, cityId: next.cityId, character: next.character })); } catch { /* ignore */ }
  }

  async function finishSignup() {
    setErr("");
    if (!d.name.trim()) return setErr("Indique ton prénom.");
    if (!d.phone.trim()) return setErr("Indique ton numéro de téléphone (utile si l'équipe Linkee a besoin de te joindre).");
    if (!d.cityId) return setErr("Choisis ta ville.");
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); return setErr("Session expirée, reconnecte-toi."); }
    // one transaction, all or nothing: sets the role + creates the Linker fiche together, so the account can
    // never end up "half-registered" (which used to cause an accueil ⇄ inscription loop)
    const { error } = await supabase.rpc("claim_linker", { p_city_id: d.cityId, p_character: d.character, p_full_name: d.name.trim(), p_phone: d.phone.trim() });
    setBusy(false);
    if (error) return setErr("Inscription impossible : " + error.message + " (les migrations 020 à 023 sont-elles passées ?)");
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    router.replace("/linker/profil?bienvenue=1");
  }

  async function submitForm() {
    setErr("");
    if (!/^\S+@\S+\.\S+$/.test(d.email)) return setErr("Adresse email invalide.");
    if (d.password.length < 8) return setErr("Mot de passe : 8 caractères minimum.");
    if (!d.name.trim()) return setErr("Indique ton prénom.");
    if (!d.cityId) return setErr("Choisis ta ville.");
    if (!consent) return setErr("Coche la case pour accepter l'utilisation de tes données avant de continuer.");
    setBusy(true);
    saveDraft(d);
    const { data, error } = await supabase.auth.signUp({
      email: d.email.trim().toLowerCase(),
      password: d.password,
      options: { emailRedirectTo: `${window.location.origin}/linker/inscription` },
    });
    setBusy(false);
    if (error) return setErr(/already|registered|exists/i.test(error.message) ? "Un compte existe déjà avec cet email." : error.message);
    if (data.session) return setPhase("finish"); // email confirmation is off: continue right away
    setSentTo(d.email);
    setPhase("sentEmail");
  }

  const charCell = (key: CharKey) => {
    const on = d.character === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setD((x) => ({ ...x, character: key }))}
        className="relative rounded-[16px] border-2 py-2 text-center"
        style={{ borderColor: on ? "var(--sun-d,#e0a800)" : "var(--border)", background: on ? "#fff3c4" : "var(--card)" }}
      >
        <CharSvg html={characterSVG(key, { stage: 0, size: 56, noScale: true })} />
        <div className="text-[11px] font-bold text-[var(--navy)]">{CH[key].n}</div>
        {on && <span className="absolute top-1 right-1.5 text-[13px]">✅</span>}
      </button>
    );
  };

  if (phase === "checking") return <div className="flex min-h-screen items-center justify-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</div>;

  if (phase === "sentEmail")
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-[380px] rounded-[24px] bg-[var(--card)] p-7 text-center shadow-[var(--shadow)]">
          <div className="text-[40px]">📬</div>
          <h1 className="mt-2 font-display text-[22px] font-black text-[var(--navy)]">Vérifie ta boîte mail</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--slate)]">
            Un e-mail de confirmation vient d&apos;être envoyé à <strong className="text-[var(--navy)]">{sentTo}</strong>. Clique sur le lien qu&apos;il contient pour finir ton inscription — tu retrouveras ton personnage {CH[d.character].n} et tout ce que tu as déjà rempli.
          </p>
        </div>
      </div>
    );

  const showAuthFields = phase === "form";

  return (
    <div className="min-h-screen bg-[var(--cream)] px-5 py-8">
      <div className="mx-auto max-w-[440px]">
        <h1 className="text-center font-display text-[26px] font-black text-[var(--navy)]">Crée ton Linker</h1>
        <p className="mt-1 text-center text-[13px] font-semibold text-[var(--slate)]">{showAuthFields ? "Ton compte bénévole, en une minute." : "Encore un peu d'infos, et c'est prêt !"}</p>

        <div className="mt-5 rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
          <div className="mb-1 rounded-[18px]" style={{ background: "linear-gradient(180deg,#d9f3ff,#f4e9ff)" }}>
            <div className="flex justify-center py-2">
              <CharSvg html={characterSVG(d.character, { stage: 0, size: 110 })} />
            </div>
          </div>
          <div className="text-center font-display text-[16px] font-extrabold text-[var(--navy)]">Bébé {CH[d.character].n} · Padawan</div>
        </div>

        {showAuthFields && (
          <>
            <label className={labelCls + " mt-4"}>Ton e-mail</label>
            <input type="email" className={fieldCls} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="prenom@email.fr" />
            <label className={labelCls}>Mot de passe</label>
            <input type="password" className={fieldCls} value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} placeholder="8 caractères minimum" />
          </>
        )}
        <label className={labelCls + (showAuthFields ? "" : " mt-4")}>Ton prénom</label>
        <input className={fieldCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Léa" />
        <label className={labelCls}>Ton téléphone <span className="font-semibold text-[var(--muted)]">(pour qu&apos;on puisse te joindre si besoin)</span></label>
        <input type="tel" className={fieldCls} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="06 12 34 56 78" />
        <label className={labelCls}>Ta ville</label>
        <select className={fieldCls} value={d.cityId} onChange={(e) => setD({ ...d, cityId: e.target.value })}>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label className={labelCls}>Fruits</label>
        <div className="grid grid-cols-4 gap-2">{FRUITS.map(charCell)}</div>
        <label className={labelCls}>Légumes</label>
        <div className="grid grid-cols-4 gap-2">{LEGUMES.map(charCell)}</div>

        {showAuthFields && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-[1.5] font-semibold text-[var(--slate)]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-[17px] w-[17px] flex-none accent-[var(--turquoise)]" />
            <span>
              J&apos;accepte que Linkee utilise mes données (prénom, téléphone, ville) pour organiser les collectes bénévoles — voir la{" "}
              <a href="/politique-de-confidentialite" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--turquoise)] underline">politique de confidentialité</a>.
            </span>
          </label>
        )}

        {err && <div className="mt-3 rounded-[14px] bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-bold text-[var(--critical)]">{err}</div>}

        <button
          type="button"
          disabled={busy || (showAuthFields && !consent)}
          onClick={showAuthFields ? submitForm : finishSignup}
          className="mt-5 flex min-h-[54px] w-full items-center justify-center rounded-[40px] bg-[var(--navy-deep)] font-display text-[17px] font-bold text-[var(--panel-fg)] disabled:opacity-60"
        >
          {busy ? "Un instant…" : `Choisir ${CH[d.character].n} !`}
        </button>
      </div>
    </div>
  );
}
