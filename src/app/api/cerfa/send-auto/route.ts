import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient, sendCerfaMail } from "@/lib/cerfaMail";
import { cerfaAutoSendOf, cerfaDefaultRecipient } from "@/lib/cerfa";

export const dynamic = "force-dynamic";

// Envoi AUTOMATIQUE d'un Cerfa tout juste déposé par la comptabilité : il part par mail au contact choisi sur la fiche du partenaire,
// sans attendre une échéance. Réservé au Superadmin et à la Comptabilité. Un Cerfa déjà envoyé n'est jamais renvoyé ici.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!prof || prof.active === false || !["admin_principal", "comptabilite"].includes(prof.role as string)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { requestId?: string } | null;
  if (!body?.requestId) return NextResponse.json({ error: "Demande manquante." }, { status: 400 });
  const { data: visible } = await supabase.from("cerfa_requests").select("id").eq("id", body.requestId).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Clé de service manquante." }, { status: 500 });

  const { data: req } = await admin.from("cerfa_requests").select("id,status,cerfa_path,partners(fiche)").eq("id", body.requestId).maybeSingle();
  if (!req || req.status !== "emise" || !req.cerfa_path) return NextResponse.json({ error: "Ce Cerfa n'est pas encore émis." }, { status: 400 });
  const partner = (Array.isArray(req.partners) ? req.partners[0] : req.partners) as { fiche: Record<string, unknown> | null } | null;
  const fiche = partner?.fiche ?? null;
  if (!cerfaAutoSendOf(fiche).enabled) return NextResponse.json({ error: "Envoi automatique désactivé sur la fiche du partenaire." }, { status: 400 });
  const { data: done } = await admin.from("cerfa_mails").select("id").eq("request_id", req.id).eq("status", "envoye").limit(1);
  if ((done ?? []).length > 0) return NextResponse.json({ ok: true, sent: false, error: "Déjà envoyé." });
  const to = cerfaDefaultRecipient(fiche);
  if (!to) return NextResponse.json({ error: "Aucune adresse e-mail n'est renseignée sur la fiche du partenaire.", sent: false }, { status: 400 });

  const r = await sendCerfaMail({ admin, requestId: req.id as string, to: to.email, mode: "auto", sentBy: auth.user.id });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code, sent: false }, { status: r.code === "not_configured" ? 503 : r.code === "provider" ? 502 : 400 });
  return NextResponse.json({ ok: true, sent: true, to: r.to });
}
