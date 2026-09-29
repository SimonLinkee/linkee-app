"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** La Boutique a fusionné avec la Garde-robe (un onglet en moins dans la barre du bas) — on redirige l'ancien lien. */
export default function BoutiqueRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/linker/garde-robe");
  }, [router]);
  return null;
}
