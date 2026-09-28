import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Sends the e-mail copy of in-app notifications (new partner request, planning modified, cancellation, day closed).
// The notifications themselves are created by database triggers; this route only mails the ones not yet mailed.
// It needs RESEND_API_KEY (https://resend.com) — without it nothing is sent and the in-app bell still works.

const THROTTLE_MS = 30 * 60 * 1000; // a refreshed "planning modified" notification is re-mailed at most every 30 min

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const resendKey = process.env.RESEND_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!resendKey || !serviceKey) return NextResponse.json({ sent: 0, reason: "Emails non configurés" });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: pending } = await admin
    .from("notifications")
    .select("id,user_id,title,body,link,created_at,emailed_at")
    .is("read_at", null)
    .gte("created_at", since)
    .order("created_at");
  const due = (pending ?? []).filter((n) => !n.emailed_at || (new Date(n.created_at).getTime() > new Date(n.emailed_at).getTime() && Date.now() - new Date(n.emailed_at).getTime() > THROTTLE_MS));
  if (due.length === 0) return NextResponse.json({ sent: 0 });

  const { data: profiles } = await admin.from("profiles").select("id,email,active").in("id", Array.from(new Set(due.map((n) => n.user_id))));
  const emailOf = new Map((profiles ?? []).filter((p) => p.email && p.active !== false).map((p) => [p.id as string, p.email as string]));

  const origin = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get("origin") || `https://${request.headers.get("host")}`;
  const from = process.env.NOTIFY_FROM || "Linkee <onboarding@resend.dev>";
  let sent = 0;
  for (const n of due) {
    const to = emailOf.get(n.user_id);
    if (!to) continue;
    const url = origin + (n.link ?? "/");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `Linkee — ${n.title}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px"><h2 style="color:#001641;margin:0 0 8px">${escapeHtml(n.title)}</h2><p style="color:#4D5C7A">${escapeHtml(n.body ?? "")}</p><p><a href="${url}" style="background:#0A1A3F;color:#FDF4ED;padding:10px 18px;border-radius:40px;text-decoration:none;font-weight:700">Ouvrir Linkee</a></p></div>`,
      }),
    });
    if (res.ok) {
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id);
      sent++;
    }
  }
  return NextResponse.json({ sent });
}
