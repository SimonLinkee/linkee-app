import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Account creation / password reset need the Supabase *service role* key, which must never reach the browser.
// It lives only in the server environment variable SUPABASE_SERVICE_ROLE_KEY.

const ROLES = ["en_attente", "admin_principal", "admin_local", "logisticien", "partenaire", "beneficiaire"];

async function requireMainAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: prof } = await supabase.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
  return prof?.role === "admin_principal" && prof.active !== false ? auth.user : null;
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  if (!(await requireMainAdmin())) return NextResponse.json({ error: "Réservé à l'administrateur principal." }, { status: 403 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "La clé serveur SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." }, { status: 500 });

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
    full_name?: string;
    role?: string;
    city_id?: string | null;
    partner_ids?: string[];
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  if (!body?.password || body.password.length < 8) return NextResponse.json({ error: "Mot de passe : 8 caractères minimum." }, { status: 400 });
  const role = body.role && ROLES.includes(body.role) ? body.role : "en_attente";

  const created = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "Création impossible";
    return NextResponse.json({ error: /already|registered|exists/i.test(msg) ? "Un compte existe déjà avec cet email." : msg }, { status: 400 });
  }
  const id = created.data.user.id;

  // the on_auth_user_created trigger already inserted the profile row; complete it
  const upd = await admin
    .from("profiles")
    .upsert({ id, email, full_name: body.full_name?.trim() || null, role, city_id: body.city_id || null, active: true });
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });

  if (role === "partenaire" && body.partner_ids?.length) {
    const links = await admin.from("partner_users").insert(body.partner_ids.map((partner_id) => ({ profile_id: id, partner_id })));
    if (links.error) return NextResponse.json({ error: links.error.message }, { status: 500 });
  }
  return NextResponse.json({ id });
}

// Set a new password for an existing account (the admin passes it on to the person).
export async function PATCH(request: Request) {
  if (!(await requireMainAdmin())) return NextResponse.json({ error: "Réservé à l'administrateur principal." }, { status: 403 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "La clé serveur SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." }, { status: 500 });
  const body = (await request.json().catch(() => null)) as { id?: string; password?: string } | null;
  if (!body?.id || !body.password || body.password.length < 8) return NextResponse.json({ error: "Mot de passe : 8 caractères minimum." }, { status: 400 });
  const res = await admin.auth.admin.updateUserById(body.id, { password: body.password });
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
