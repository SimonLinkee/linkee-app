import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Enregistre (POST) ou retire (DELETE) l'abonnement « notifications sur ce téléphone » de la personne connectée.
type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const sub = (await request.json().catch(() => null)) as Sub | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !/^https:\/\//.test(sub.endpoint)) return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: auth.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 200) },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message + " (la migration 080 est-elle passée ?)" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Abonnement manquant." }, { status: 400 });
  await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", auth.user.id);
  return NextResponse.json({ ok: true });
}
