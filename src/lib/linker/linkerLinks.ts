// Les Links vus par un Linker. Le Linker ne lit pas directement les fiches des partenaires et des associations :
// la fonction linker_links() (migration 051) renvoie adresses et contraintes dès qu'un Link est proposé, et les
// téléphones / codes d'accès seulement une fois le Link accepté par ce Linker (jusqu'à la collecte).
import type { SupabaseClient } from "@supabase/supabase-js";

export type PhoneContact = { type: string | null; nom: string | null; tel: string | null };

export type LinkerLink = {
  id: string;
  status: string;
  kg_estime: number;
  is_fresh: boolean;
  mode_required: "walk" | "car";
  window_date: string;
  window_from: string;
  window_to: string;
  asso_confirmed: boolean;
  linker_id: string | null;
  denree: string | null;
  photo_paths: string[] | null;
  partner_name: string | null;
  partner_address: string | null;
  partner_allow_backpack: boolean | null;
  partner_allow_car: boolean | null;
  partner_access: Record<string, boolean> | null;
  beneficiary_name: string | null;
  beneficiary_address: string | null;
  partner_contacts: PhoneContact[] | null;
  partner_access_note: string | null;
  beneficiary_contacts: PhoneContact[] | null;
  beneficiary_access_note: string | null;
};

export async function fetchLinkerLinks(supabase: SupabaseClient): Promise<LinkerLink[]> {
  const { data } = await supabase.rpc("linker_links");
  return (data ?? []) as LinkerLink[];
}

/** Contraintes d'accès connues du partenaire (cases cochées dans sa fiche), en clair. */
export const ACCESS_LABELS: Record<string, string> = {
  digicode: "Digicode",
  quai: "Quai de livraison",
  camion: "Accès camion",
  etage: "Étage / ascenseur",
  horaire: "Horaire strict",
};
export function accessChips(access: Record<string, boolean> | null | undefined): string[] {
  return Object.entries(access ?? {}).filter(([k, v]) => v === true && ACCESS_LABELS[k]).map(([k]) => ACCESS_LABELS[k]);
}
