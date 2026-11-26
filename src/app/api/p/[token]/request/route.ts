import { NextResponse } from "next/server";
import { adminClient, clean, isHm, isIsoDate, partnerByToken } from "@/lib/partnerLink";

export const dynamic = "force-dynamic";

// Demande de collecte exceptionnelle depuis le lien du partenaire : prise en compte tout de suite (pas de validation de l'antenne).
// La demande entre directement dans le Planning (arrêt « demande exceptionnelle client »), et l'équipe est prévenue.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  const p = await partnerByToken(admin, token);
  if (!p) return NextResponse.json({ error: "Ce lien n'est pas ou plus valable." }, { status: 404 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Demande illisible." }, { status: 400 });

  const date = b.date, from = b.from, to = b.to;
  if (!isIsoDate(date) || !isHm(from) || !isHm(to)) return NextResponse.json({ error: "Indiquez un jour et des heures valides." }, { status: 400 });
  if (to <= from) return NextResponse.json({ error: "L'heure de fin doit être après l'heure de début." }, { status: 400 });
  const todayIso = new Date().toISOString().slice(0, 10);
  const maxIso = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  if (date < todayIso || date > maxIso) return NextResponse.json({ error: "Choisissez un jour à partir d'aujourd'hui (6 mois maximum)." }, { status: 400 });

  const denrees = Array.isArray(b.denrees) ? (b.denrees as unknown[]).map((d) => clean(d, 40)).filter(Boolean).slice(0, 8) : [];
  const volume = Number(b.volume);
  const unit = ["kg", "cartons", "pièces"].includes(String(b.unit)) ? String(b.unit) : "kg";
  const reason = clean(b.reason, 80), access = clean(b.access, 300), contactName = clean(b.contactName, 80), contactPhone = clean(b.contactPhone, 30);
  if (!contactPhone) return NextResponse.json({ error: "Laissez un numéro de téléphone pour vous joindre sur place." }, { status: 400 });

  // garde-fou simple contre les envois en boucle : 10 demandes par jour et par partenaire
  const { count } = await admin.from("exceptional_requests").select("id", { count: "exact", head: true }).eq("partner_id", p.id).gte("created_at", todayIso + "T00:00:00Z");
  if ((count ?? 0) >= 10) return NextResponse.json({ error: "Trop de demandes aujourd'hui. Contactez directement votre antenne." }, { status: 429 });

  const hm = (s: string) => s.replace(":", "h");
  const comment = [
    `Créneau souhaité ${hm(from)}–${hm(to)}`,
    volume > 0 ? `Volume estimé ${volume} ${unit}` : "",
    reason ? `Motif : ${reason}` : "",
    access ? `Accès : ${access}` : "",
    `Contact sur place : ${contactName || "—"} ${contactPhone}`,
    "Demande faite depuis le lien du partenaire.",
  ].filter(Boolean).join(" · ");
  const denree = denrees.join(", ") || null;
  const volumeKg = unit === "kg" && volume > 0 ? volume : null;

  const { error: e1 } = await admin.from("collectes").insert({
    city_id: p.city_id, kind: "demande_client", partner_id: p.id, scheduled_date: date, scheduled_time: from,
    sort_order: 99, status: "todo", comment, duration_min: 10, denree, volume_kg: volumeKg,
  });
  if (e1) return NextResponse.json({ error: "Demande non enregistrée, réessayez dans un instant." }, { status: 500 });
  // trace de la demande (l'insertion prévient l'équipe : cloche + téléphone)
  await admin.from("exceptional_requests").insert({
    partner_id: p.id, wished_date: date, wished_time: from, denree, volume_kg: volumeKg, comment, status: "validee",
  });
  return NextResponse.json({ ok: true, date, from, to });
}
