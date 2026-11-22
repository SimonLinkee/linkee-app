"use client";

import { useState } from "react";
import { usePwaInstall } from "@/lib/pwaInstall";

// Bouton « Ajouter Linkee à mon écran d'accueil » de la page de connexion (entre l'en-tête et l'adresse email) :
// l'icône Linkee vibre comme une icône d'iPhone, un « + » pulse et un reflet balaie le bouton.
//  • Android / Chrome / Edge : un tap ouvre la fenêtre d'installation du navigateur.
//  • iPhone / iPad : un tap déplie le mode d'emploi (Partager → Sur l'écran d'accueil) ; hors Safari, on explique d'abord d'ouvrir la page dans Safari.
//  • Appli déjà installée, ou navigateur qui ne sait pas installer : rien n'est affiché.
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="inline h-[17px] w-[17px] align-[-3px]" aria-hidden="true">
      <path d="M12 15 V3 M8 7 L12 3 L16 7" />
      <path d="M6 11 H5 A1.5 1.5 0 0 0 3.5 12.5 V19.5 A1.5 1.5 0 0 0 5 21 H19 A1.5 1.5 0 0 0 20.5 19.5 V12.5 A1.5 1.5 0 0 0 19 11 H18" />
    </svg>
  );
}

export default function InstallAppButton() {
  const { installed, canPrompt, ios, iosOther, prompt } = usePwaInstall();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [help, setHelp] = useState(false);

  if (installed && state !== "done") return null;
  if (!canPrompt && !ios && !iosOther && state !== "done") return null;

  async function onClick() {
    if (!canPrompt) {
      setHelp((v) => !v);
      return;
    }
    setState("busy");
    const r = await prompt();
    setState(r === "accepted" ? "done" : "idle");
  }

  return (
    <div className="px-7 pt-5">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={state === "busy"}
        aria-expanded={help}
        className={`relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition-colors disabled:opacity-70 ${
          state === "done" ? "border-[var(--good)] bg-[var(--good)] text-white" : "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-white"
        }`}
      >
        {/* reflet qui balaie le bouton */}
        {state !== "done" && (
          <span className="absolute top-0 right-0 rounded-bl-xl bg-[var(--turquoise)] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.08em] text-[#04262e] uppercase">Nouveau</span>
        )}
        <span aria-hidden="true" className="install-shine pointer-events-none absolute top-0 bottom-0 left-[-40px] w-[26px] skew-x-[-20deg] bg-[rgba(79,193,214,0.28)]" />
        <span className="install-jiggle relative flex-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={46} height={46} className="h-[46px] w-[46px] rounded-xl" />
          {state !== "done" && <span aria-hidden="true" className="install-plus absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--turquoise)] text-[16px] leading-none font-medium text-[#04262e]">+</span>}
        </span>
        <span className="relative min-w-0 flex-1 pt-2 leading-[1.25]">
          <span className="block font-display text-[16px] font-extrabold text-white">{state === "done" ? "Linkee est installée" : state === "busy" ? "Installation…" : "Linkee a maintenant son appli !"}</span>
          <span className="block text-[13px] font-semibold text-white">{state === "done" ? "Retrouve-la sur ton écran d'accueil." : "Télécharge-la !"}</span>
        </span>
      </button>

      {help && (ios || iosOther) && (
        <ol className="mt-3 flex flex-col gap-2 rounded-2xl bg-[var(--input-bg)] px-4 py-3.5 text-[12.5px] leading-[1.4] text-[var(--navy)]">
          {iosOther && (
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--navy-deep)] text-[11px] font-bold text-[var(--panel-fg)]">1</span>
              <span>
                Ouvre cette page dans <strong>Safari</strong> (sur iPhone, l&apos;installation ne se fait que depuis Safari).
              </span>
            </li>
          )}
          <li className="flex gap-2.5">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--navy-deep)] text-[11px] font-bold text-[var(--panel-fg)]">{iosOther ? 2 : 1}</span>
            <span>
              Touche le bouton <strong>Partager</strong> <ShareIcon /> (le carré avec une flèche vers le haut, en bas de l&apos;écran).
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--navy-deep)] text-[11px] font-bold text-[var(--panel-fg)]">{iosOther ? 3 : 2}</span>
            <span>
              Fais défiler le menu et touche <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--navy-deep)] text-[11px] font-bold text-[var(--panel-fg)]">{iosOther ? 4 : 3}</span>
            <span>
              Touche <strong>Ajouter</strong> en haut à droite : l&apos;icône Linkee apparaît sur ton écran d&apos;accueil.
            </span>
          </li>
        </ol>
      )}
    </div>
  );
}
