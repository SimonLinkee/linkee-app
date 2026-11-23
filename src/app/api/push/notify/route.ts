import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendNotification, setVapidDetails } from "web-push"; // import nommé : le module n'a pas d'export par défaut (Turbopack)

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Appelé par la base de données (déclencheur sur la table notifications, migration 080) à chaque nouvelle notification :
// envoie la bannière + la pastille aux téléphones de la personne. Protégé par un mot de passe partagé (PUSH_WEBHOOK_SECRET).
export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-push-secret") !== secret) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pub || !priv || !key) return NextResponse.json({ error: "Notifications téléphone non configurées (clés VAPID manquantes)." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "Notification manquante." }, { status: 400 });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: n } = await admin.from("notifications").select("id,user_id,title,body,link,type").eq("id", body.id).maybeSingle();
  if (!n) return NextResponse.json({ error: "Notification introuvable." }, { status: 404 });
  const [{ data: subs }, { count }] = await Promise.all([
    admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", n.user_id),
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", n.user_id).is("read_at", null),
  ]);
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contact@linkee.co", pub, priv);
  const payload = JSON.stringify({ id: n.id, title: n.title, body: n.body ?? "", url: n.link || "/", unread: count ?? 1, tag: n.type === "message" ? "msg-" + n.id : "linkee-" + n.type });
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // téléphone désinscrit : on nettoie
        else console.error("push: envoi refusé", code, (e as { body?: string }).body ?? (e as Error).message);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return NextResponse.json({ sent, removed: dead.length });
}
