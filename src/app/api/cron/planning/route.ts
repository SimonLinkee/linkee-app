import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// Called on the 20th of each month by Vercel Cron (see vercel.json) : génère le planning du mois suivant pour toutes
// les villes (fonction SQL generate_planning_next_month, migration 056 — sans doublon, un mois n'est généré qu'une fois).
// Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.rpc("generate_planning_next_month");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ generated: data });
}
