"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_DEFS, critterSvg, type AvatarKey } from "@/lib/avatars";

export default function ProfilPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<AvatarKey>("pomme");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [since, setSince] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [anecdote, setAnecdote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [autosaveVisible, setAutosaveVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const ROLE_TEXT: Record<string, string> = {
    admin_principal: "Superadmin",
    comptabilite: "Comptabilité",
    admin_local: "Responsable d'antenne",
    resp_distribution: "Resp. Distribution",
    logisticien: "Logisticien",
    partenaire: "Partenaire",
    beneficiaire: "Bénéficiaire",
    en_attente: "En attente",
  };

  function flashAutosave() {
    setAutosaveVisible(true);
    window.setTimeout(() => setAutosaveVisible(false), 1600);
  }
  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      setUserId(auth.user.id);
      let res = await supabase.from("profiles").select("full_name,email,phone,role,avatar_key,anecdote,created_at").eq("id", auth.user.id).maybeSingle();
      if (res.error) res = (await supabase.from("profiles").select("full_name,email,phone,role,created_at").eq("id", auth.user.id).maybeSingle()) as typeof res; // before migration 006
      const p = res.data as { full_name: string | null; email: string | null; phone: string | null; role: string; avatar_key?: string | null; anecdote?: string | null; created_at: string } | null;
      if (!p) return;
      setName(p.full_name ?? "");
      setEmail(p.email ?? auth.user.email ?? "");
      setTel(p.phone ?? "");
      setRole(p.role);
      setAnecdote(p.anecdote ?? "");
      if (p.avatar_key && p.avatar_key in AVATAR_DEFS) setAvatar(p.avatar_key as AvatarKey);
      setSince(new Date(p.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
    })();
  }, [supabase]);

  // Saves one or more of my own profile fields (name, phone, avatar, anecdote).
  async function save(patch: Record<string, string | null>) {
    if (!userId) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) showToast("Enregistrement impossible : " + error.message);
    else flashAutosave();
  }

  return (
    <div className="max-w-[920px]">
      <h1 className="font-display text-[32px] leading-none font-black">Mon profil</h1>
      <p className="mb-4 text-[13.5px] text-[var(--slate)]">Ton avatar, tes coordonnées et ta petite touche perso — visible par le reste de l&apos;équipe Linkee.</p>

      <div
        className="relative mb-[18px] flex flex-wrap items-center gap-[22px] overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-[26px] shadow-[var(--shadow)]"
      >
        <div
          className="absolute inset-0 z-0 transition-[background]"
          style={{ background: `radial-gradient(circle at 8% 30%, ${AVATAR_DEFS[avatar].tint}, transparent 65%)`, opacity: 0.5 }}
        />
        <div className="relative z-10 flex flex-none flex-col items-center gap-2">
          <div
            className="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-full border-4 border-[var(--card)] bg-[var(--card)] shadow-[0_10px_26px_-10px_rgba(0,22,65,0.35)]"
            dangerouslySetInnerHTML={{ __html: critterSvg(avatar) }}
          />
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-[11.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M4 8 L7 4 H17 L20 8" />
              <rect x="3" y="8" width="18" height="12" rx="2" />
              <circle cx="12" cy="14" r="3.2" />
            </svg>
            Changer d&apos;avatar
          </button>
        </div>
        <div className="relative z-10 min-w-[220px] flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => save({ full_name: name.trim() || null })}
            placeholder="Ton prénom"
            className="w-full rounded-lg border-b-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-display text-[30px] leading-none font-black text-[var(--navy)] outline-none hover:border-b-[var(--turquoise)] focus:border-b-[var(--turquoise)]"
          />
          <div className="mt-1.5 text-xs text-[var(--slate)]">{since ? `Membre depuis ${since}` : ""}</div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] py-1.5 pr-3.5 pl-2.5 text-xs font-bold text-[var(--panel-fg)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 opacity-75">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10 V7 A4 4 0 0 1 16 7 V10" />
            </svg>
            <span>{ROLE_TEXT[role] ?? "—"}</span>
          </div>
          <div className="mt-1.5 text-[10.5px] text-[var(--slate)] italic">Rôle défini par l&apos;administrateur — non modifiable ici.</div>
        </div>
      </div>

      <div className={`mb-3.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${autosaveVisible ? "opacity-100" : "opacity-0"}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
          <path d="M20 6 L9 17 L4 12" />
        </svg>
        Modifications enregistrées
      </div>

      {pickerOpen && (
        <div className="mb-[18px] rounded-[18px] border-[1.5px] border-[var(--turquoise)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h4 className="mb-0.5 font-display text-[15px] font-extrabold">Choisis ton avatar</h4>
          <p className="mb-3.5 text-[11.5px] text-[var(--slate)]">Un fruit, un légume, ou ta propre photo — comme tu préfères.</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
            {(Object.keys(AVATAR_DEFS) as AvatarKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAvatar(key);
                  save({ avatar_key: key });
                }}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[3px] bg-[var(--input-bg)] ${
                    avatar === key ? "border-[var(--turquoise)] shadow-[0_0_0_3px_rgba(79,193,214,0.25)]" : "border-[var(--border)]"
                  }`}
                  dangerouslySetInnerHTML={{ __html: critterSvg(key) }}
                />
                <span className="text-[10.5px] font-semibold text-[var(--slate)]">{AVATAR_DEFS[key].label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => showToast("La photo personnelle arrive bientôt — pour l'instant, choisis un avatar.")}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-dashed border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
                  <path d="M4 8 L7 4 H17 L20 8" />
                  <rect x="3" y="8" width="18" height="12" rx="2" />
                  <circle cx="12" cy="14" r="3.2" />
                </svg>
              </span>
              <span className="text-[10.5px] font-semibold text-[var(--slate)]">Ma photo</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[22px]">
          <h3 className="mb-0.5 flex items-center gap-2 font-display text-base font-extrabold">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] text-[var(--turquoise)]">
              <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
              <path d="M10.5 18.5 H13.5" />
            </svg>
            Coordonnées
          </h3>
          <p className="mb-4 text-[11.5px] text-[var(--slate)]">Modifiables directement par toi.</p>
          <div className="mb-3.5">
            <label className="mb-[5px] block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Téléphone</label>
            <input
              type="tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              onBlur={() => save({ phone: tel.trim() || null })}
              className="w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            />
          </div>
          <div>
            <label className="mb-[5px] block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Email</label>
            <input
              type="email"
              value={email}
              readOnly
              title="L'email de connexion ne se change pas ici"
              className="w-full cursor-not-allowed rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--slate)] outline-none"
            />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[18px] border border-[var(--border)] bg-gradient-to-br from-[var(--card)] to-[var(--input-bg)] p-[22px]">
          <span className="pointer-events-none absolute top-3.5 right-[18px] font-display text-[52px] leading-none font-black text-[var(--track)] select-none">&quot;</span>
          <div className="relative z-10">
            <h3 className="mb-0.5 flex items-center gap-2 font-display text-base font-extrabold">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] text-[var(--turquoise)]">
                <path d="M4 5 H20 V16 H9 L5 19 V16 H4 Z" />
              </svg>
              Une anecdote sur moi
            </h3>
            <p className="mb-4 text-[11.5px] text-[var(--slate)]">Pour que l&apos;équipe apprenne à te connaître.</p>
            <textarea
              value={anecdote}
              onChange={(e) => setAnecdote(e.target.value)}
              onBlur={() => save({ anecdote: anecdote.trim() || null })}
              placeholder="Une habitude, un souvenir marquant, un fun fact…"
              className="min-h-[120px] w-full resize-y rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] leading-[1.55] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[380px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">
          {toast}
        </div>
      )}
    </div>
  );
}
