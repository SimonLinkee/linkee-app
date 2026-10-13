import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { promises as dnsPromises } from "dns";
import { defaultCerfaMessage, isEmail } from "@/lib/cerfa";

// Envoi d'un Cerfa émis par mail. SERVEUR UNIQUEMENT : utilise la clé de service et les identifiants d'envoi.
// Deux moyens d'envoi, au choix (le premier configuré est utilisé) :
//   1) une boîte mail existante, par SMTP : SMTP_HOST, SMTP_PORT (465 par défaut), SMTP_USER, SMTP_PASS ; MAIL_FROM facultatif
//      (par défaut « Linkee <SMTP_USER> ») — rien à changer côté DNS
//   2) Resend : RESEND_API_KEY + MAIL_FROM (ex. « Linkee <cerfa@linkee.co> », domaine vérifié chez Resend)
// MAIL_REPLY_TO (facultatif) : adresse qui reçoit les réponses.

export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Adresse IP du serveur SMTP, trouvée par le résolveur DNS direct (c-ares) : évite l'erreur « getaddrinfo EBUSY » du résolveur système. */
async function resolveSmtpHost(host: string): Promise<string> {
  try {
    const ips = await dnsPromises.resolve4(host);
    return ips[Math.floor(Math.random() * ips.length)] ?? host;
  } catch {
    return host; // à défaut, on laisse le résolveur système essayer
  }
}

const smtpConfigured = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
const resendConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
export const mailConfigured = () => smtpConfigured() || resendConfigured();

type Mail = { to: string; subject: string; html: string; text: string; filename: string; contentBase64: string };

/** Envoie le mail par la boîte SMTP si elle est configurée, sinon par Resend. */
async function deliver(m: Mail): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (smtpConfigured()) {
    const port = Number(process.env.SMTP_PORT) || 465;
    const message = {
      from: process.env.MAIL_FROM || `Linkee <${process.env.SMTP_USER}>`,
      to: m.to,
      ...(process.env.MAIL_REPLY_TO ? { replyTo: process.env.MAIL_REPLY_TO } : {}),
      subject: m.subject,
      text: m.text,
      html: m.html,
      attachments: [{ filename: m.filename, content: Buffer.from(m.contentBase64, "base64"), contentType: "application/pdf" }],
    };
    // Les erreurs réseau passagères (résolution DNS occupée « EBUSY », « EAI_AGAIN », coupure…) sont réessayées jusqu'à 3 fois ;
    // une vraie erreur (mauvais mot de passe, adresse refusée) est renvoyée tout de suite.
    const transient = (e: unknown) => /EBUSY|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EPIPE|ESOCKET|Greeting never received/i.test(String((e as { code?: string })?.code ?? "") + " " + String((e as Error)?.message ?? ""));
    let last: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const host = process.env.SMTP_HOST as string;
        const transport = nodemailer.createTransport({ host: await resolveSmtpHost(host), port, secure: port === 465, tls: { servername: host }, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 15000, socketTimeout: 30000 });
        const info = await transport.sendMail(message);
        return { ok: true, id: info.messageId ?? null };
      } catch (e) {
        last = e;
        if (!transient(e) || attempt === 3) break;
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    return { ok: false, error: "Envoi par la boîte mail refusé : " + ((last as Error)?.message ?? "erreur inconnue") + (transient(last) ? " (problème réseau passager : réessaie dans un instant)" : "") };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [m.to],
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
        subject: m.subject,
        html: m.html,
        text: m.text,
        attachments: [{ filename: m.filename, content: m.contentBase64 }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, error: `Envoi refusé (${res.status}) : ${body.message ?? body.name ?? "erreur inconnue"}` };
    return { ok: true, id: body.id ?? null };
  } catch (e) {
    return { ok: false, error: "Service d'envoi injoignable : " + (e as Error).message };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Result = { ok: true; to: string } | { ok: false; error: string; code: "not_configured" | "invalid" | "not_found" | "not_issued" | "provider" };

/** Envoie le Cerfa PDF d'une demande émise ; enregistre le résultat dans cerfa_mails. */
export async function sendCerfaMail(opts: { admin: SupabaseClient; requestId: string; to: string; message?: string; mode: "manuel" | "auto"; sentBy: string | null }): Promise<Result> {
  const { admin, requestId, mode, sentBy } = opts;
  const to = opts.to.trim();
  if (!mailConfigured()) return { ok: false, error: "L'envoi de mails n'est pas encore configuré (à renseigner dans Vercel : une boîte mail SMTP_HOST / SMTP_USER / SMTP_PASS, ou RESEND_API_KEY et MAIL_FROM).", code: "not_configured" };
  if (!isEmail(to)) return { ok: false, error: "Adresse e-mail invalide.", code: "invalid" };

  const { data: req } = await admin.from("cerfa_requests").select("id,status,total_value,issued_at,cerfa_path,cerfa_name,partners(name)").eq("id", requestId).maybeSingle();
  if (!req) return { ok: false, error: "Demande introuvable.", code: "not_found" };
  const r = req as unknown as { status: string; total_value: number | string; issued_at: string | null; cerfa_path: string | null; cerfa_name: string | null; partners: { name: string } | { name: string }[] | null };
  if (r.status !== "emise" || !r.cerfa_path) return { ok: false, error: "Ce Cerfa n'est pas encore émis.", code: "not_issued" };
  const partner = (Array.isArray(r.partners) ? r.partners[0] : r.partners)?.name ?? "Partenaire";

  const log = async (status: "envoye" | "erreur", error: string | null, providerId: string | null) => {
    await admin.from("cerfa_mails").insert({ request_id: requestId, to_email: to, mode, status, error, provider_id: providerId, sent_by: sentBy });
  };

  const file = await admin.storage.from("cerfa").download(r.cerfa_path);
  if (file.error || !file.data) {
    const msg = "Fichier du Cerfa introuvable : " + (file.error?.message ?? "inconnu");
    await log("erreur", msg, null);
    return { ok: false, error: msg, code: "provider" };
  }
  const content = Buffer.from(await file.data.arrayBuffer()).toString("base64");
  const text = (opts.message ?? "").trim() || defaultCerfaMessage(r.total_value, r.issued_at);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1a18">${esc(text).replace(/\n/g, "<br>")}</div>`;
  const filename = (r.cerfa_name || `Cerfa-${partner}.pdf`).replace(/[^\w.\- ()]/g, "_");

  const subject = `Votre reçu fiscal Linkee${r.issued_at ? " — Cerfa du " + new Date(r.issued_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : ""}`;
  const out = await deliver({ to, subject, html, text, filename, contentBase64: content });
  if (!out.ok) {
    await log("erreur", out.error, null);
    return { ok: false, error: out.error, code: "provider" };
  }
  await log("envoye", null, out.id);
  return { ok: true, to };
}