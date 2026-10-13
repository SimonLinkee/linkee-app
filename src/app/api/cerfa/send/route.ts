import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient, sendCerfaMail } from "@/lib/cerfaMail";

export const dynamic = "force-dynamic";

// Envoi MANUEL d'un Cerfa émis par mail (bouton « Envoyer par mail » de la ligne). Réservé au Superadmin et à la Comptabilité.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!prof || prof.active === false || !["admin_principal", "comptabilite"].includes(prof.role as string)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { requestId?: string; to?: string; message?: string } | null;
  if (!body?.requestId || !body.to) return NextResponse.json({ error: "Demande ou adresse manquante." }, { status: 400 });
  // la demande doit être visible par l'appelant (règles d'accès de la base) avant d'utiliser la clé de service
  const { data: visible } = await supabase.from("cerfa_requests").select("id").eq("id", body.requestId).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Clé de service manquante." }, { status: 500 });

  const r = await sendCerfaMail({ admin, requestId: body.requestId, to: body.to, message: body.message, mode: "manuel", sentBy: auth.user.id });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.code === "not_configured" ? 503 : r.code === "provider" ? 502 : 400 });
  return NextResponse.json({ ok: true, to: r.to });
}