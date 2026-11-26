import { NextResponse } from "next/server";
import { adminClient, mailConfigured, sendCerfaMail } from "@/lib/cerfaMail";
import { cerfaAutoSendOf, cerfaDefaultRecipient, parisYmd } from "@/lib/cerfa";

export const dynamic = "force-dynamic";

// Appelée chaque matin par Vercel Cron (voir vercel.json) : filet de sécurité de l'envoi automatique. Le Cerfa part normalement
// tout de suite, au moment où la comptabilité le dépose (/api/cerfa/send-auto) ; ici on réessaie ceux émis depuis moins de 3 jours
// qui n'ont pas pu partir (adresse manquante corrigée depuis, panne du service de mail…). Un Cerfa déjà envoyé (à la main ou
// automatiquement) n'est jamais renvoyé. Vercel envoie « Authorization: Bearer <CRON_SECRET> ».
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });
  if (!mailConfigured()) return NextResponse.json({ skipped: "envoi de mails non configuré (RESEND_API_KEY / MAIL_FROM)" });

  const today = parisYmd(new Date());
  const { data: reqs, error } = await admin.from("cerfa_requests").select("id,issued_at,partners(fiche)").eq("status", "emise").not("cerfa_path", "is", null).gte("issued_at", new Date(Date.now() - 3 * 86400000).toISOString()).order("issued_at").limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (reqs ?? []).map((r) => r.id as string);
  const { data: logs } = ids.length ? await admin.from("cerfa_mails").select("request_id,status,sent_at").in("request_id", ids) : { data: [] };
  const sent = new Set((logs ?? []).filter((l) => l.status === "envoye").map((l) => l.request_id as string));
  const failedToday = new Set((logs ?? []).filter((l) => l.status === "erreur" && parisYmd(l.sent_at as string) === today).map((l) => l.request_id as string));

  let done = 0, failed = 0, skipped = 0;
  for (const r of (reqs ?? []) as unknown as { id: string; issued_at: string | null; partners: { fiche: Record<string, unknown> | null } | { fiche: Record<string, unknown> | null }[] | null }[]) {
    if (sent.has(r.id) || failedToday.has(r.id) || !r.issued_at) continue;
    if (done + failed >= 40) break; // garde-fou : le reste part demain
    const fiche = (Array.isArray(r.partners) ? r.partners[0] : r.partners)?.fiche ?? null;
    const auto = cerfaAutoSendOf(fiche);
    if (!auto.enabled) { skipped++; continue; }
    const to = cerfaDefaultRecipient(fiche);
    if (!to) {
      await admin.from("cerfa_mails").insert({ request_id: r.id, to_email: "-", mode: "auto", status: "erreur", error: "Aucune adresse e-mail disponible sur la fiche du partenaire." });
      failed++;
      continue;
    }
    const res = await sendCerfaMail({ admin, requestId: r.id, to: to.email, mode: "auto", sentBy: null });
    if (res.ok) done++;
    else failed++;
  }
  return NextResponse.json({ sent: done, failed, notDue: skipped });
}