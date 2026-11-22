"use client";

import { useSyncExternalStore } from "react";

// Installation de l'appli (PWA), partagée entre la bannière (PwaRegister) et le bouton de la page de connexion.
// L'événement « beforeinstallprompt » n'arrive qu'une fois : on le garde ici, dès le chargement de l'appli.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIosSafari = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
};

// instantané sous forme de texte : sa valeur ne change que si l'état change (requis par useSyncExternalStore)
const snapshot = () => `${deferred ? "p" : "-"}${installed ? "i" : "-"}${isStandalone() ? "s" : "-"}${isIosSafari() ? "x" : "-"}`;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export type PwaInstall = {
  /** l'appli est déjà installée / ouverte en plein écran : rien à proposer */
  installed: boolean;
  /** le navigateur sait ouvrir lui-même la fenêtre d'installation (Android, Chrome, Edge) */
  canPrompt: boolean;
  /** iPhone / iPad (Safari) : installation manuelle via « Partager » */
  ios: boolean;
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function usePwaInstall(): PwaInstall {
  const snap = useSyncExternalStore(subscribe, snapshot, () => "----");
  return {
    installed: snap[1] === "i" || snap[2] === "s",
    canPrompt: snap[0] === "p",
    ios: snap[3] === "x",
    prompt: async () => {
      if (!deferred) return "unavailable";
      const ev = deferred;
      await ev.prompt();
      const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      deferred = null;
      if (choice.outcome === "accepted") installed = true;
      emit();
      return choice.outcome;
    },
  };
}
