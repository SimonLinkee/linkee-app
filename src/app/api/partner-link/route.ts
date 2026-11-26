import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Le lien de déclaration d'un partenaire, pour l'afficher dans son espace (bouton « Déclarer un don », support QR).
// L'appelant doit être le partenaire lui-même (compte rattaché) ou l'équipe qui pilote sa ville. Passe par le serveur plutôt que
// par une lecture directe de la table, pour fonctionner même si la règle d'accès de la migration 086 n'est pas encore passée.
export async function GET(request: Request) {
  const partnerId = new URL(request.url).searchParams.get("partnerId") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(partnerId)) return NextResponse.json({ error: "Partenaire inconnu." }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const [{ data: prof }, { data: partner }, { data: own }] = await Promise.all([
    admin.from("profiles").select("role,city_id,active").eq("id", auth.user.id).maybeSingle(),
    admin.from("partners").select("id,city_id").eq("id", partnerId).maybeSingle(),
    admin.from("partner_users").select("partner_id").eq("profile_id", auth.user.id).eq("partner_id", partnerId).maybeSingle(),
  ]);
  if (!prof || prof.active === false || !partner) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const staff = prof.role === "admin_principal" || prof.role === "comptabilite" || (prof.role === "admin_local" && prof.city_id === partner.city_id);
  if (!own && !staff) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  let { data: link } = await admin.from("partner_links").select("token,enabled").eq("partner_id", partnerId).maybeSingle();
  if (!link) {
    const ins = await admin.from("partner_links").insert({ partner_id: partnerId }).select("token,enabled").maybeSingle(); // partenaire créé après la migration 085
    link = ins.data;
  }
  if (!link) return NextResponse.json({ error: "Lien indisponible (la migration 085 est-elle passée ?)." }, { status: 404 });
  return NextResponse.json({ token: link.token as string, enabled: link.enabled as boolean });
}
