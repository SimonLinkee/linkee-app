import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultCerfaMessage, isEmail } from "@/lib/cerfa";

// Envoi d'un Cerfa émis par mail (Resend). SERVEUR UNIQUEMENT : utilise la clé de service et la clé Resend.
// Variables d'environnement : RESEND_API_KEY, MAIL_FROM (ex. « Linkee <cerfa@linkee.co> »), MAIL_REPLY_TO (facultatif).

export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Result = { ok: true; to: string } | { ok: false; error: string; code: "not_configured" | "invalid" | "not_found" | "not_issued" | "provider" };

/** Envoie le Cerfa PDF d'une demande émise ; enregistre le résultat dans cerfa_mails. */
export async function sendCerfaMail(opts: { admin: SupabaseClient; requestId: string; to: string; message?: string; mode: "manuel" | "auto"; sentBy: string | null }): Promise<Result> {
  const { admin, requestId, mode, sentBy } = opts;
  const to = opts.to.trim();
  if (!mailConfigured()) return { ok: false, error: "L'envoi de mails n'est pas encore configuré (clé RESEND_API_KEY et adresse MAIL_FROM à renseigner dans Vercel).", code: "not_configured" };
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

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [to],
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
        subject: `Votre reçu fiscal Linkee${r.issued_at ? " — Cerfa du " + new Date(r.issued_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : ""}`,
        html,
        text,
        attachments: [{ filename, content }],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    const msg = "Service d'envoi injoignable : " + (e as Error).message;
    await log("erreur", msg, null);
    return { ok: false, error: msg, code: "provider" };
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) {
    const msg = `Envoi refusé (${res.status}) : ${body.message ?? body.name ?? "erreur inconnue"}`;
    await log("erreur", msg, null);
    return { ok: false, error: msg, code: "provider" };
  }
  await log("envoye", null, body.id ?? null);
  return { ok: true, to };
}