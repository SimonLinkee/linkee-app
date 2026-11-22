"use client";

import { useEffect, useState } from "react";

// PWA : enregistre le service worker (production seulement) et propose d'installer l'appli sur l'écran d'accueil.
//  • Android / Chrome / Edge : bouton « Installer » (événement beforeinstallprompt).
//  • iPhone / iPad (Safari) : pas de bouton possible → petite explication « Partager > Sur l'écran d'accueil ».
// La bannière se ferme et ne revient pas avant 30 jours ; elle ne s'affiche jamais dans l'appli déjà installée.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "linkee.pwa.dismissedAt";
const DAYS_HIDDEN = 30;

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const dismissedRecently = () => {
  try {
    const t = Number(window.localStorage.getItem(KEY) ?? 0);
    return t > 0 && Date.now() - t < DAYS_HIDDEN * 86400000;
  } catch {
    return false;
  }
};

export default function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* l'appli fonctionne très bien sans service worker */
      });
    }
    if (isStandalone() || dismissedRecently()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if (ios) {
      const t = window.setTimeout(() => setIosHint(true), 0);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* stockage indisponible */
    }
    setInstallEvent(null);
    setIosHint(false);
  }
  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    dismiss();
  }

  if (!installEvent && !iosHint) return null;
  return (
    <div className="fixed right-3 bottom-3 left-3 z-[300] mx-auto flex max-w-[460px] items-center gap-3 rounded-2xl bg-[var(--navy-deep)] px-4 py-3 text-[var(--panel-fg)] shadow-[0_8px_30px_rgba(0,0,0,.35)] print:hidden" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }} role="dialog" aria-label="Installer l'application Linkee">
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 flex-none rounded-xl" />
      <div className="min-w-0 flex-1 text-[12.5px] leading-[1.35]">
        <div className="text-[14px] font-bold">Installer Linkee</div>
        {iosHint ? (
          <span className="text-[var(--panel-fg-dim)]">
            Touche <strong>Partager</strong> puis <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
          </span>
        ) : (
          <span className="text-[var(--panel-fg-dim)]">Ouvre-la comme une appli, en plein écran.</span>
        )}
      </div>
      {installEvent && (
        <button type="button" onClick={() => void install()} className="flex-none rounded-[40px] bg-[var(--turquoise)] px-4 py-2 text-[13px] font-bold text-[#04262e]">
          Installer
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Fermer" className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[18px] text-[var(--panel-fg-dim)] hover:bg-white/10">
        ×
      </button>
    </div>
  );
}
