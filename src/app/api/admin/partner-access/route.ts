import { NextResponse } from "next/server";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { partnerPassword } from "@/lib/partnerPassword";

export const dynamic = "force-dynamic";

// Accès des comptes partenaires : le Superadmin (toutes les villes) et le Responsable d'antenne (sa ville) voient le mot de passe
// « NomDuPartenaireLinkee2027 » de chaque compte rattaché à un partenaire, et peuvent le (ré)appliquer — pour un partenaire ou pour
// tous les partenaires de la ville. Le mot de passe n'est jamais stocké : il se recalcule à partir du nom.

type Me = { role: string; cityId: string | null };
async function caller(): Promise<Me | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: prof } = await supabase.from("profiles").select("role,city_id,active").eq("id", auth.user.id).maybeSingle();
  if (!prof || prof.active === false || !["admin_principal", "admin_local"].includes(prof.role as string)) return null;
  return { role: prof.role as string, cityId: (prof.city_id as string | null) ?? null };
}
function admin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

type Account = { id: string; email: string; name: string; partner: string; password: string };

/** Les comptes (rôle « partenaire ») rattachés à ces partenaires, avec leur mot de passe : celui du premier partenaire (par nom) auquel le compte est rattaché. */
async function accountsFor(a: SupabaseClient, partnerIds: string[]): Promise<Account[]> {
  if (!partnerIds.length) return [];
  const { data: links } = await a.from("partner_users").select("profile_id,partner_id").in("partner_id", partnerIds);
  const profileIds = Array.from(new Set((links ?? []).map((l) => l.profile_id as string)));
  if (!profileIds.length) return [];
  const [{ data: profs }, { data: allLinks }] = await Promise.all([
    a.from("profiles").select("id,email,full_name,role").in("id", profileIds).eq("role", "partenaire"),
    a.from("partner_users").select("profile_id,partners(name)").in("profile_id", profileIds),
  ]);
  const namesBy = new Map<string, string[]>();
  for (const l of (allLinks ?? []) as unknown as { profile_id: string; partners: { name: string } | { name: string }[] | null }[]) {
    const p = Array.isArray(l.partners) ? l.partners[0] : l.partners;
    if (p?.name) namesBy.set(l.profile_id, [...(namesBy.get(l.profile_id) ?? []), p.name]);
  }
  return (profs ?? []).map((p) => {
    const first = (namesBy.get(p.id as string) ?? []).sort((x, y) => x.localeCompare(y, "fr"))[0] ?? "Partenaire";
    return { id: p.id as string, email: (p.email as string) ?? "", name: (p.full_name as string) ?? "", partner: first, password: partnerPassword(first) };
  });
}

async function partnerAllowed(a: SupabaseClient, me: Me, partnerId: string) {
  const { data: p } = await a.from("partners").select("id,city_id").eq("id", partnerId).maybeSingle();
  if (!p) return false;
  return me.role === "admin_principal" || (me.cityId != null && p.city_id === me.cityId);
}

export async function GET(request: Request) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const a = admin();
  if (!a) return NextResponse.json({ error: "Clé serveur manquante." }, { status: 500 });
  const partnerId = new URL(request.url).searchParams.get("partnerId") ?? "";
  if (!partnerId || !(await partnerAllowed(a, me, partnerId))) return NextResponse.json({ error: "Partenaire introuvable." }, { status: 404 });
  return NextResponse.json({ accounts: await accountsFor(a, [partnerId]) });
}

// Applique le mot de passe « NomLinkee2027 » : { partnerId } pour les comptes d'un partenaire, { all: true, cityId } pour toute la ville.
export async function POST(request: Request) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const a = admin();
  if (!a) return NextResponse.json({ error: "Clé serveur manquante." }, { status: 500 });
  const body = (await request.json().catch(() => null)) as { partnerId?: string; all?: boolean; cityId?: string } | null;
  let partnerIds: string[] = [];
  if (body?.partnerId) {
    if (!(await partnerAllowed(a, me, body.partnerId))) return NextResponse.json({ error: "Partenaire introuvable." }, { status: 404 });
    partnerIds = [body.partnerId];
  } else if (body?.all) {
    const cityId = me.role === "admin_principal" ? body.cityId : me.cityId;
    if (!cityId) return NextResponse.json({ error: "Choisissez une ville." }, { status: 400 });
    const { data: ps } = await a.from("partners").select("id").eq("city_id", cityId).is("deleted_at", null);
    partnerIds = (ps ?? []).map((p) => p.id as string);
  } else return NextResponse.json({ error: "Demande incomplète." }, { status: 400 });

  const accounts = await accountsFor(a, partnerIds);
  const done: Account[] = [];
  const failed: string[] = [];
  for (const acc of accounts) {
    const { error } = await a.auth.admin.updateUserById(acc.id, { password: acc.password });
    if (error) failed.push(acc.email);
    else done.push(acc);
  }
  return NextResponse.json({ done, failed });
}
