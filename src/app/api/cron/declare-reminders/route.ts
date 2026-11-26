import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { deliver, esc, mailConfigured } from "@/lib/cerfaMail";
import { isEmail, parisYmd } from "@/lib/cerfa";
import { slotsForDate, type Creneaux } from "@/lib/creneaux";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Appelée toutes les 10 minutes par la base (tâche planifiée, voir le RÉGLAGE de la migration 088) : 30 minutes avant le début du
// créneau d'une collecte, le partenaire reçoit un mail avec le lien de son formulaire « déclarer un don ».
//  • il ne part RIEN tant que l'interrupteur général (app_config « declare_reminders » = on) n'est pas activé ;
//  • seuls les partenaires dont la fiche a « envoi automatique du mail de déclaration » coché reçoivent le mail ;
//  • un seul mail par collecte ; rien si la collecte est annulée / faite ou si le don est déjà déclaré.
// Protégée par le même mot de passe partagé que les notifications téléphone (en-tête x-push-secret) ou par CRON_SECRET.
const LEAD_MIN = 35; // on envoie quand il reste entre 0 et 35 minutes avant le début

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}h${String(m % 60).padStart(2, "0")}`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export async function GET(request: Request) {
  const okPush = !!process.env.PUSH_WEBHOOK_SECRET && request.headers.get("x-push-secret") === process.env.PUSH_WEBHOOK_SECRET;
  const okCron = !!process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!okPush && !okCron) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: sw } = await admin.from("app_config").select("value").eq("key", "declare_reminders").maybeSingle();
  if (sw?.value !== "on") return NextResponse.json({ skipped: "mails de déclaration désactivés (interrupteur général)" });
  if (!mailConfigured()) return NextResponse.json({ skipped: "envoi de mails non configuré" });

  const now = new Date();
  const today = parisYmd(now);
  const nowMin = toMin(now.toLocaleTimeString("sv-SE", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }));
  const origin = process.env.SITE_URL || new URL(request.url).origin;

  const { data: cols } = await admin
    .from("collectes")
    .select("id,partner_id,scheduled_time,partners(name,city_id,active,deleted_at,fiche)")
    .eq("scheduled_date", today)
    .eq("status", "todo")
    .eq("source", "planning")
    .in("kind", ["partner", "exceptionnel", "demande_client"])
    .not("partner_id", "is", null);
  type Row = { id: string; partner_id: string; scheduled_time: string | null; partners: { name: string; city_id: string; active: boolean; deleted_at: string | null; fiche: Record<string, unknown> | null } | { name: string; city_id: string; active: boolean; deleted_at: string | null; fiche: Record<string, unknown> | null }[] | null };
  const rows = ((cols ?? []) as unknown as Row[]).map((r) => ({ ...r, p: Array.isArray(r.partners) ? r.partners[0] : r.partners })).filter((r) => r.p && r.p.active && !r.p.deleted_at && r.p.fiche?.declareMailAuto === true);
  if (!rows.length) return NextResponse.json({ sent: 0, candidates: 0 });

  const ids = rows.map((r) => r.id);
  const pids = Array.from(new Set(rows.map((r) => r.partner_id)));
  const [{ data: links }, { data: decls }, { data: done }, { data: cities }] = await Promise.all([
    admin.from("partner_links").select("partner_id,token,enabled").in("partner_id", pids),
    admin.from("partner_declarations").select("collecte_id").in("collecte_id", ids),
    admin.from("declare_reminders").select("collecte_id").in("collecte_id", ids),
    admin.from("cities").select("id,name,phone"),
  ]);
  const tokenBy = new Map((links ?? []).filter((l) => l.enabled).map((l) => [l.partner_id as string, l.token as string]));
  const declared = new Set((decls ?? []).map((d) => d.collecte_id as string));
  const already = new Set((done ?? []).map((d) => d.collecte_id as string));
  const cityBy = new Map((cities ?? []).map((c) => [c.id as string, c as { name: string; phone: string | null }]));

  let sent = 0, failed = 0, skipped = 0;
  for (const r of rows) {
    const p = r.p!;
    const token = tokenBy.get(r.partner_id);
    if (!token || declared.has(r.id) || already.has(r.id)) { skipped++; continue; }
    // début du créneau : l'heure prévue de la collecte, sinon le créneau habituel du jour sur la fiche du partenaire
    let start: number | null = null;
    if (r.scheduled_time) start = toMin(r.scheduled_time);
    else {
      const slots = slotsForDate((p.fiche?.creneaux as Creneaux) ?? {}, today).map((s) => toMin(s.open)).sort((a, b) => a - b);
      start = slots.find((s) => s - nowMin > 0 && s - nowMin <= LEAD_MIN) ?? null;
    }
    if (start == null) { skipped++; continue; }
    const delta = start - nowMin;
    if (delta <= 0 || delta > LEAD_MIN) { skipped++; continue; }

    const contacts = ((p.fiche?.contacts as { type?: string; mail?: string }[]) ?? []).filter((c) => c.mail && isEmail(c.mail));
    const pref = contacts.filter((c) => !/compta|financ/i.test(c.type ?? ""));
    const to = Array.from(new Set((pref.length ? pref : contacts).map((c) => (c.mail as string).trim())));
    if (!to.length) { skipped++; continue; }

    // on réserve la collecte AVANT d'envoyer : deux appels en parallèle ne peuvent pas envoyer deux fois
    const ins = await admin.from("declare_reminders").insert({ collecte_id: r.id, partner_id: r.partner_id, to_email: to.join(", ") });
    if (ins.error) { skipped++; continue; }

    const city = cityBy.get(p.city_id);
    const link = `${origin}/p/${token}`;
    const when = hm(start);
    const foot = `L'équipe Linkee${city?.name ? " " + city.name : ""}${city?.phone ? " · " + city.phone : ""}`;
    const text = [
      "Bonjour,",
      "",
      `Notre logisticien passe chez vous aujourd'hui à partir de ${when}. Avant son arrivée, vous pouvez nous indiquer ce que vous donnez, en 1 minute et sans compte :`,
      "",
      `Déclarer mon don : ${link}`,
      "",
      "Vous pouvez saisir les quantités, ou joindre votre bon de livraison ou un fichier Excel. Notre logisticien retrouvera vos informations à son arrivée et n'aura qu'à les confirmer.",
      "",
      "Un imprévu ? Vous pouvez aussi demander une collecte supplémentaire depuis le même lien.",
      "",
      "Merci pour votre engagement contre le gaspillage !",
      foot,
    ].join("\n");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1a18">
<p>Bonjour,</p>
<p>Notre logisticien passe chez vous aujourd'hui à partir de <strong>${esc(when)}</strong>. Avant son arrivée, vous pouvez nous indiquer ce que vous donnez, en 1 minute et sans compte :</p>
<p style="margin:22px 0"><a href="${esc(link)}" style="background:#001641;color:#fdf4ed;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:40px;display:inline-block">Déclarer mon don</a></p>
<p>Vous pouvez saisir les quantités, ou joindre votre bon de livraison ou un fichier Excel. Notre logisticien retrouvera vos informations à son arrivée et n'aura qu'à les confirmer.</p>
<p>Un imprévu ? Vous pouvez aussi demander une collecte supplémentaire depuis le même lien.</p>
<p>Merci pour votre engagement contre le gaspillage !<br>${esc(foot)}</p>
</div>`;
    const out = await deliver({ to, subject: `Collecte Linkee aujourd'hui à ${when} : déclarez votre don`, html, text });
    if (out.ok) sent++;
    else {
      failed++;
      await admin.from("declare_reminders").delete().eq("collecte_id", r.id); // pas parti : on réessaiera au prochain passage
    }
  }
  return NextResponse.json({ sent, failed, skipped, candidates: rows.length });
}
