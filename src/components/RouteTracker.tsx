"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Mémorise la page précédente (chemin seulement, jamais de paramètres) pour que l'onglet « Remontées » sache
 * d'où part une remontée. Ne stocke rien d'autre, uniquement dans la session du navigateur. */
export default function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const cur = window.sessionStorage.getItem("linkee:cur");
      if (cur && cur !== pathname) window.sessionStorage.setItem("linkee:prev", cur);
      window.sessionStorage.setItem("linkee:cur", pathname);
    } catch {
      /* stockage indisponible : la page d'origine sera simplement vide */
    }
  }, [pathname]);
  return null;
}
