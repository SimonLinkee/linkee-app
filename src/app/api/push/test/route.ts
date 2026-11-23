import { NextResponse } from "next/server";
import { createECDH } from "node:crypto";
import { sendNotification, setVapidDetails } from "web-push";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Diagnostic : envoie une bannière de test aux téléphones de la personne connectée et dit précisément ce qui coince
// (clés absentes ou qui ne vont pas ensemble, adresse de contact invalide, refus du service de notifications…).
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT || "mailto:contact@linkee.co";
  let keysMatch: boolean | null = null;
  try {
    if (pub && priv) {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(Buffer.from(priv.trim().replace(/-/g, "+").replace(/_/g, "/"), "base64"));
      keysMatch = b64url(ecdh.getPublicKey()) === pub.trim();
    }
  } catch {
    keysMatch = false;
  }
  const env = {
    publicKey: !!pub,
    privateKey: !!priv,
    subject,
    subjectValid: /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/\S+)$/.test(subject),
    webhookSecret: !!process.env.PUSH_WEBHOOK_SECRET,
    serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    keysMatch,
  };

  const { data: subs } = await supabase.from("push_subscriptions").select("endpoint,p256dh,auth,user_agent").eq("user_id", auth.user.id);
  const results: { phone: string; ok: boolean; status?: number; detail?: string }[] = [];
  if (pub && priv && env.subjectValid) {
    try {
      setVapidDetails(subject, pub, priv);
    } catch (e) {
      return NextResponse.json({ env, subs: subs?.length ?? 0, results, error: "Clés invalides : " + (e as Error).message });
    }
    for (const s of subs ?? []) {
      const phone = /iphone|ipad/i.test(s.user_agent ?? "") ? "iPhone / iPad" : /android/i.test(s.user_agent ?? "") ? "Android" : "Autre appareil";
      try {
        const r = await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: "Test Linkee", body: "Si tu vois cette bannière, les notifications téléphone marchent.", url: "/", unread: 1, tag: "linkee-test" }),
          { TTL: 600 },
        );
        results.push({ phone, ok: true, status: r.statusCode });
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        results.push({ phone, ok: false, status: err.statusCode, detail: (err.body || err.message || "").slice(0, 200) });
      }
    }
  }
  return NextResponse.json({ env, subs: subs?.length ?? 0, results });
}
