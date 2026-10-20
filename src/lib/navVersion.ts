"use client";

import { useSyncExternalStore } from "react";

// Choix du menu : « v2 » = barre du haut + menu de gauche allégé (par défaut sur cette branche de test), « v1 » = menu actuel.
// Mémorisé dans ce navigateur seulement ; ?nav=v1 ou ?nav=v2 dans l'adresse force le choix.
const KEY = "linkee.nav";
const EVT = "linkee-nav-change";
export type NavVersion = "v1" | "v2";

function read(): NavVersion {
  try {
    const q = new URLSearchParams(window.location.search).get("nav");
    if (q === "v1" || q === "v2") {
      window.localStorage.setItem(KEY, q);
      return q;
    }
    return window.localStorage.getItem(KEY) === "v1" ? "v1" : "v2";
  } catch {
    return "v2";
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useNavVersion(): [NavVersion, (v: NavVersion) => void] {
  const v = useSyncExternalStore(subscribe, read, () => "v2" as NavVersion);
  const set = (next: NavVersion) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* pas de stockage */
    }
    window.dispatchEvent(new Event(EVT));
  };
  return [v, set];
}