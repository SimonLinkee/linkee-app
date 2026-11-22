"use client";

import { useState } from "react";
import { usePwaInstall } from "@/lib/pwaInstall";

// Bouton « Ajouter à mon écran d'accueil » de la page de connexion : un petit téléphone sur lequel l'icône Linkee vient se poser.
//  • Android / Chrome / Edge : ouvre la fenêtre d'installation du navigateur.
//  • iPhone / iPad (Safari) : affiche le geste à faire (Partager → Sur l'écran d'accueil).
//  • Appli déjà installée, ou navigateur qui ne sait pas installer : rien n'est affiché.
export default function InstallAppButton() {
  const { installed, canPrompt, ios, prompt } = usePwaInstall();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [help, setHelp] = useState(false);

  if (installed && state !== "done") return null;
  if (!canPrompt && !ios && state !== "done") return null;

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
    <div className="border-t border-[var(--border)] px-7 pt-5 pb-6 text-center">
      <div className="relative mx-auto mt-6 mb-3 h-[112px] w-[78px]">
        <div aria-hidden="true" className="relative grid h-full w-full grid-cols-3 content-start gap-1.5 rounded-2xl border-[3px] border-[var(--navy-deep)] bg-white p-2 pt-3">
          {Array.from({ length: 9 }).map((_, k) => (
            <i key={k} className="block h-[14px] rounded bg-[#d9dde8]" />
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={18} height={18} className="install-tile absolute top-[-36px] left-[calc(50%-9px)] h-[18px] w-[18px] rounded-[5px]" />
        </div>
      </div>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={state === "busy"}
        className={`inline-flex items-center gap-2 rounded-[40px] border-[1.5px] px-5 py-2.5 font-display text-[15px] font-bold transition-colors disabled:opacity-70 ${
          state === "done" ? "border-[var(--good)] bg-[var(--good)] text-white" : "border-[var(--navy-deep)] text-[var(--navy-deep)] hover:bg-[var(--navy-deep)] hover:text-[var(--panel-fg)]"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
          {state === "done" ? <path d="M5 12.5 L10 17.5 L19 7" /> : <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5 H13" /></>}
        </svg>
        {state === "done" ? "Installée" : state === "busy" ? "Installation…" : "Ajouter à mon écran d'accueil"}
      </button>
      <p className="mt-2 text-[11.5px] text-[var(--slate)]">Ouvre Linkee comme une appli, en plein écran.</p>
      {help && ios && (
        <p className="mx-auto mt-3 max-w-[280px] rounded-xl bg-[var(--input-bg)] px-3.5 py-2.5 text-[12.5px] leading-[1.45] text-[var(--navy)]">
          Touche <strong>Partager</strong> (le carré avec une flèche, en bas de Safari), puis <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
        </p>
      )}
    </div>
  );
}
