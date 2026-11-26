import type { Metadata } from "next";
import DeclareClient from "./DeclareClient";

// Page publique d'un partenaire : pas de connexion, le lien est la clé. Jamais indexée par les moteurs de recherche.
export const metadata: Metadata = {
  title: "Linkee — Déclarer un don",
  robots: { index: false, follow: false },
};

export default async function PartnerPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DeclareClient token={token} />;
}
