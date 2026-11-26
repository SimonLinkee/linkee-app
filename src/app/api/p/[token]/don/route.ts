import { NextResponse } from "next/server";
import { DECLARE_DENREES, MAX_DECLARE_FILE, adminClient, clean, partnerByToken } from "@/lib/partnerLink";

export const dynamic = "force-dynamic";

const OK_EXT = /\.(pdf|xlsx|xls|csv|jpe?g|png|webp|heic|heif|docx?|ods)$/i;

// Déclaration d'un don depuis le lien du partenaire : lignes (catégorie + kg) et/ou fichier joint (bon de livraison, Excel),
// rattachées à une collecte. Le logisticien retrouve ces quantités pré-remplies et n'a plus qu'à les revalider.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  const p = await partnerByToken(admin, token);
  if (!p) return NextResponse.json({ error: "Ce lien n'est pas ou plus valable." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envoi illisible." }, { status: 400 });
  let payload: { collecteId?: string | null; items?: { denree?: string; kg?: number; note?: string }[]; note?: string; contact?: string };
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Envoi illisible." }, { status: 400 });
  }

  const items = (payload.items ?? [])
    .map((i) => ({ denree: String(i.denree ?? ""), kg: Math.round(Number(i.kg) * 100) / 100, note: clean(i.note, 120) }))
    .filter((i) => DECLARE_DENREES.includes(i.denree) && i.kg > 0 && i.kg <= 100000)
    .slice(0, 20)
    .map((i) => (i.note ? i : { denree: i.denree, kg: i.kg }));
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0).slice(0, 5);
  if (!items.length && !files.length) return NextResponse.json({ error: "Indiquez au moins une quantité ou joignez un fichier." }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_DECLARE_FILE) return NextResponse.json({ error: `« ${f.name} » dépasse 10 Mo.` }, { status: 400 });
    if (!OK_EXT.test(f.name)) return NextResponse.json({ error: `« ${f.name} » : format non accepté (PDF, Excel, photo).` }, { status: 400 });
  }

  // la collecte choisie doit être celle de ce partenaire
  let collecteId: string | null = null;
  if (payload.collecteId) {
    const { data: c } = await admin.from("collectes").select("id").eq("id", payload.collecteId).eq("partner_id", p.id).maybeSingle();
    if (!c) return NextResponse.json({ error: "Cette collecte n'est pas la vôtre." }, { status: 400 });
    collecteId = c.id as string;
  }

  const { count } = await admin.from("partner_declarations").select("id", { count: "exact", head: true }).eq("partner_id", p.id).gte("created_at", new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  if ((count ?? 0) >= 20) return NextResponse.json({ error: "Trop de déclarations aujourd'hui. Contactez directement votre antenne." }, { status: 429 });

  const stored: { path: string; name: string; size: number; mime: string; at: string }[] = [];
  for (const f of files) {
    const safe = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `declarations/${p.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safe}`;
    const { error } = await admin.storage.from("collecte-photos").upload(path, await f.arrayBuffer(), { contentType: f.type || undefined });
    if (error) return NextResponse.json({ error: "Le fichier n'a pas pu être envoyé, réessayez." }, { status: 500 });
    stored.push({ path, name: f.name, size: f.size, mime: f.type || "", at: new Date().toISOString() });
  }

  const { error } = await admin.from("partner_declarations").insert({
    partner_id: p.id, city_id: p.city_id, collecte_id: collecteId, items, note: clean(payload.note, 500) || null, contact: clean(payload.contact, 80) || null, files: stored,
  });
  if (error) return NextResponse.json({ error: "Déclaration non enregistrée, réessayez dans un instant." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
