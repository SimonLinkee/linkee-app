import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { runBackup } from "@/lib/backup";

// Backups screen: list existing backups (GET) and create one now (POST). Main admin only.

async function guard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (prof?.role !== "admin_principal") return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "nokey" as const;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  const admin = await guard();
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur principal." }, { status: 403 });
  if (admin === "nokey") return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." }, { status: 500 });
  const list = await admin.storage.from("backups").list("", { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (list.error) return NextResponse.json({ error: list.error.message }, { status: 500 });
  const files = await Promise.all(
    (list.data ?? [])
      .filter((f) => f.name.endsWith(".json"))
      .map(async (f) => {
        const signed = await admin.storage.from("backups").createSignedUrl(f.name, 600, { download: f.name });
        return { name: f.name, size: (f.metadata as { size?: number } | null)?.size ?? null, created_at: f.created_at, url: signed.data?.signedUrl ?? null };
      }),
  );
  return NextResponse.json({ files });
}

export async function POST() {
  const admin = await guard();
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur principal." }, { status: 403 });
  if (admin === "nokey") return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur Vercel." }, { status: 500 });
  try {
    return NextResponse.json(await runBackup(admin));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
