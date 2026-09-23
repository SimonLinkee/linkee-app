"use client";

import { useState } from "react";

type AvatarKey = "pomme" | "tomate" | "fraise" | "carotte" | "brocoli" | "avocat" | "citron" | "aubergine";

const TEARDROP = "M50,24 C27,24 16,48 21,67 C26,88 38,95 50,95 C62,95 74,88 79,67 C84,48 73,24 50,24 Z";

const AVATAR_DEFS: Record<AvatarKey, { bodyPath: string; bodyFill: string; extra: string; tint: string; label: string }> = {
  pomme: {
    bodyPath: TEARDROP,
    bodyFill: "#E4483A",
    extra:
      '<ellipse cx="60" cy="20" rx="7" ry="4" fill="#4CAF50" transform="rotate(20 60 20)"/><rect x="47" y="12" width="4" height="12" rx="2" fill="#6B4A2B"/>',
    tint: "#FBE2DE",
    label: "Pomme",
  },
  tomate: {
    bodyPath: "M50,30 A28,28 0 1 1 49.9,30 Z",
    bodyFill: "#E8503A",
    extra:
      '<path d="M50,10 L54,22 L64,18 L57,27 L67,30 L55,32 L60,42 L50,34 L40,42 L45,32 L33,30 L43,27 L36,18 L46,22 Z" fill="#4CAF50"/>',
    tint: "#FBE2DA",
    label: "Tomate",
  },
  fraise: {
    bodyPath: TEARDROP,
    bodyFill: "#EF4D6B",
    extra:
      '<path d="M50,26 L58,12 L52,24 L64,10 L55,26 L70,16 L57,29 L50,22 L43,29 L30,16 L45,26 L36,10 L48,24 L42,12 Z" fill="#4CAF50"/>' +
      '<circle cx="38" cy="52" r="1.6" fill="#FFD54F"/><circle cx="50" cy="46" r="1.6" fill="#FFD54F"/><circle cx="62" cy="52" r="1.6" fill="#FFD54F"/>' +
      '<circle cx="34" cy="70" r="1.6" fill="#FFD54F"/><circle cx="50" cy="76" r="1.6" fill="#FFD54F"/><circle cx="66" cy="70" r="1.6" fill="#FFD54F"/>',
    tint: "#FCE1E7",
    label: "Fraise",
  },
  carotte: {
    bodyPath: "M30,26 L70,26 L54,92 Q50,97 46,92 Z",
    bodyFill: "#F0932B",
    extra:
      '<path d="M40,26 Q34,8 28,4" stroke="#52A85C" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M50,26 Q50,4 50,0" stroke="#52A85C" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M60,26 Q66,8 72,4" stroke="#52A85C" stroke-width="3.4" fill="none" stroke-linecap="round"/>',
    tint: "#FCE8D2",
    label: "Carotte",
  },
  brocoli: {
    bodyPath:
      "M50,60 A14,14 0 1 1 50,59.9 Z M32,50 A12,12 0 1 1 32,49.9 Z M68,50 A12,12 0 1 1 68,49.9 Z M50,36 A13,13 0 1 1 50,35.9 Z M35,66 A11,11 0 1 1 35,65.9 Z M65,66 A11,11 0 1 1 65,65.9 Z",
    bodyFill: "#4C9A5B",
    extra: '<rect x="43" y="75" width="14" height="18" rx="4" fill="#C9E4B4"/>',
    tint: "#E1EFDA",
    label: "Brocoli",
  },
  avocat: { bodyPath: TEARDROP, bodyFill: "#3F6B2F", extra: "", tint: "#E4EBDA", label: "Avocat" },
  citron: {
    bodyPath: "M16,52 C16,38 30,26 50,26 C70,26 84,38 84,52 C84,66 70,78 50,78 C30,78 16,66 16,52 Z",
    bodyFill: "#F4D144",
    extra: '<path d="M14,52 L22,47 L22,57 Z" fill="#F4D144"/><path d="M86,52 L78,47 L78,57 Z" fill="#F4D144"/>',
    tint: "#FBF3D3",
    label: "Citron",
  },
  aubergine: {
    bodyPath: "M50,26 C30,26 22,50 26,68 C30,88 40,96 50,96 C60,96 70,88 74,68 C78,50 70,26 50,26 Z",
    bodyFill: "#5B3A73",
    extra: '<path d="M40,26 L60,26 L55,34 L45,34 Z" fill="#4CAF50"/><rect x="48" y="16" width="4" height="12" rx="2" fill="#4CAF50"/>',
    tint: "#E7DDEF",
    label: "Aubergine",
  },
};

function critterSvg(key: AvatarKey) {
  const d = AVATAR_DEFS[key];
  return `<svg viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="${d.tint}"/>
    <path d="${d.bodyPath}" fill="${d.bodyFill}"/>
    ${d.extra}
    <path d="M28,64 Q12,56 16,38" stroke="#3A2A1A" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="16" cy="38" r="4.2" fill="#3A2A1A"/>
    <path d="M72,64 Q88,56 84,38" stroke="#3A2A1A" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="84" cy="38" r="4.2" fill="#3A2A1A"/>
    <circle cx="40" cy="47" r="7" fill="#fff"/><circle cx="60" cy="47" r="7" fill="#fff"/>
    <circle cx="42" cy="49" r="3.4" fill="#1A1A1A"/><circle cx="58" cy="49" r="3.4" fill="#1A1A1A"/>
    <circle cx="43.6" cy="47.2" r="1.2" fill="#fff"/><circle cx="59.6" cy="47.2" r="1.2" fill="#fff"/>
    <ellipse cx="30" cy="59" rx="5.2" ry="3.2" fill="#ff8fa3" opacity="0.4"/><ellipse cx="70" cy="59" rx="5.2" ry="3.2" fill="#ff8fa3" opacity="0.4"/>
    <path d="M40,61 Q50,69 60,61" stroke="#1A1A1A" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>`;
}

export default function ProfilPage() {
  const [avatar, setAvatar] = useState<AvatarKey>("pomme");
  const [tel, setTel] = useState("06 12 00 00 01");
  const [email, setEmail] = useState("simon@linkee.org");
  const [anecdote, setAnecdote] = useState(
    "A commencé à faire les marchés dès 6h du matin avant même de créer Linkee — depuis, il garde toujours une banane dans sa poche « au cas où »."
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [autosaveVisible, setAutosaveVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flashAutosave() {
    setAutosaveVisible(true);
    window.setTimeout(() => setAutosaveVisible(false), 1600);
  }
  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
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
          <div className="font-display text-[30px] leading-none font-black text-[var(--navy)]">Simon</div>
          <div className="mt-1.5 text-xs text-[var(--slate)]">Membre depuis janvier 2024</div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] py-1.5 pr-3.5 pl-2.5 text-xs font-bold text-[var(--panel-fg)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 opacity-75">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10 V7 A4 4 0 0 1 16 7 V10" />
            </svg>
            <span>Administrateur &amp; fondateur</span>
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
                  flashAutosave();
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
              onClick={() => showToast("Aperçu uniquement — l'import de photo sera branché à Supabase Storage dans l'app réelle.")}
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
              onBlur={flashAutosave}
              className="w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            />
          </div>
          <div>
            <label className="mb-[5px] block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={flashAutosave}
              className="w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
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
              onBlur={flashAutosave}
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
