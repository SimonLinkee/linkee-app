import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { formatCreneaux, type Creneaux } from "@/lib/creneaux";

// Côté serveur uniquement : la page publique d'un partenaire (/p/<jeton>) n'a pas de session, elle passe par ces
// fonctions avec la clé de service. Le jeton (32 caractères aléatoires) fait office de clé : « pas de sécurité » en plus pour le moment.

export const DECLARE_DENREES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie", "Bacs gastronomiques alimentaires", "Autres"];
export const DENREE_FLAGS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie", "Produits surgelés", "Boissons", "Non alimentaire"];
export const MAX_DECLARE_FILE = 10 * 1024 * 1024;

export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export type LinkedPartner = {
  id: string;
  name: string;
  city_id: string;
  category: string | null;
  address: string | null;
  active: boolean;
  fiche: Record<string, unknown>;
};

/** Le partenaire d'un jeton, ou null si le jeton est inconnu, le lien mis en pause ou le partenaire désactivé. */
export async function partnerByToken(admin: SupabaseClient, token: string): Promise<LinkedPartner | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const { data: link } = await admin.from("partner_links").select("partner_id,enabled").eq("token", token).maybeSingle();
  if (!link || !link.enabled) return null;
  const { data: p } = await admin
    .from("partners")
    .select("id,name,city_id,category,address,active,fiche,deleted_at")
    .eq("id", link.partner_id)
    .maybeSingle();
  if (!p || p.deleted_at || p.active === false) return null;
  return p as LinkedPartner;
}

export function partnerSummary(p: LinkedPartner) {
  const f = p.fiche ?? {};
  const flags = (f.denrees as Record<string, boolean>) ?? {};
  const creneaux = (f.creneaux as Creneaux) ?? {};
  return {
    name: p.name,
    category: p.category,
    denrees: DENREE_FLAGS.filter((d) => flags[d]),
    creneaux: formatCreneaux(creneaux) ? creneaux : null,
    creneauxText: formatCreneaux(creneaux) || ((f.slotDisplay as string) || (f.creneau as string) || ""),
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00"));
export const isHm = (v: unknown): v is string => typeof v === "string" && HM.test(v);
export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
