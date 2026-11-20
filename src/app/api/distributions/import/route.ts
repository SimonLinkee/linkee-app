import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDistribWorkbook } from "@/lib/distribSheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

// Import des chiffres d'une distribution depuis le classeur Google Sheet « Schéma cible » (lien public) ou un fichier Excel envoyé.
// Renvoie tous les onglets reconnus ; c'est l'appli qui choisit celui de la bonne date / du bon lieu et montre un aperçu avant de remplir.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!prof || prof.active === false || !["admin_principal", "admin_local", "resp_distribution"].includes(prof.role as string)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  let buf: ArrayBuffer;
  let source = "Google Sheet";
  const file = form.get("file");
  const url = String(form.get("url") ?? "").trim();
  if (file && typeof file !== "string") {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop lourd (20 Mo maximum)." }, { status: 400 });
    buf = await file.arrayBuffer();
    source = file.name || "Fichier Excel";
  } else if (url) {
    // seule l'adresse d'un Google Sheet est acceptée : on reconstruit nous-mêmes l'adresse d'export (pas de requête vers un hôte libre)
    const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
    if (!m) return NextResponse.json({ error: "Colle le lien d'un Google Sheet (https://docs.google.com/spreadsheets/d/…)." }, { status: 400 });
    let res: Response;
    try {
      res = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`, { redirect: "follow", signal: AbortSignal.timeout(45000) });
    } catch {
      return NextResponse.json({ error: "Google ne répond pas. Réessaie dans un instant." }, { status: 502 });
    }
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || /text\/html/i.test(type)) {
      return NextResponse.json({ error: "Impossible de lire le fichier : il doit être partagé en « Tous les utilisateurs disposant du lien » (lecteur)." }, { status: 422 });
    }
    buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "Le classeur est trop lourd (20 Mo maximum)." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Colle un lien Google Sheet ou choisis un fichier Excel." }, { status: 400 });
  }

  try {
    const { tabs, sheetNames } = await parseDistribWorkbook(buf);
    return NextResponse.json({ tabs, sheetNames, source });
  } catch {
    return NextResponse.json({ error: "Fichier illisible : envoie un classeur Excel (.xlsx) ou un Google Sheet." }, { status: 422 });
  }
}
