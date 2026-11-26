import { NextResponse } from "next/server";
import { adminClient, partnerByToken, partnerSummary } from "@/lib/partnerLink";

export const dynamic = "force-dynamic";

// Page publique d'un partenaire (lien sans connexion) : ce qu'il voit en arrivant — ses créneaux, ses types de dons, ses collectes proches.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  const p = await partnerByToken(admin, token);
  if (!p) return NextResponse.json({ error: "Ce lien n'est pas ou plus valable. Contactez votre antenne Linkee." }, { status: 404 });

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 21 * 86400000);
  const to = new Date(today.getTime() + 45 * 86400000);
  const [{ data: collectes }, { data: city }] = await Promise.all([
    admin
      .from("collectes")
      .select("id,scheduled_date,scheduled_time,kind,status")
      .eq("partner_id", p.id)
      .in("kind", ["partner", "exceptionnel", "demande_client"])
      .neq("status", "annule")
      .gte("scheduled_date", iso(from))
      .lte("scheduled_date", iso(to))
      .order("scheduled_date")
      .order("scheduled_time"),
    admin.from("cities").select("name,phone,contact_email").eq("id", p.city_id).maybeSingle(),
  ]);
  const todayIso = iso(today);
  const list = (collectes ?? []).map((c) => ({ id: c.id as string, date: c.scheduled_date as string, time: (c.scheduled_time as string | null)?.slice(0, 5) ?? null, kind: c.kind as string, done: c.status === "collecte" }));
  return NextResponse.json({
    ...partnerSummary(p),
    upcoming: list.filter((c) => c.date >= todayIso && !c.done).slice(0, 6),
    recent: list.filter((c) => c.date < todayIso || c.done).reverse().slice(0, 8),
    city: { name: city?.name ?? "", phone: (city as { phone?: string | null } | null)?.phone ?? null, email: (city as { contact_email?: string | null } | null)?.contact_email ?? null },
  });
}
