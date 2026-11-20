import ExcelJS from "exceljs";

// Lecture du classeur « Schéma cible » des distributions (un onglet par date) — côté serveur uniquement.
// On reconnaît les cellules par leurs LIBELLÉS (pas par leur position), pour résister à un décalage de colonne.

export type ParsedLine = {
  category: string;
  product: string;
  nb_colis: string;
  colis_weight_kg: string;
  weight_kg: string;
  supplier: string;
  don_pct: string;
  delivery_mode: string;
  eco_label: string;
  geo_label: string;
};
export type ParsedMeta = { distribution: string; date: string | null; baskets: string; registered: string; presence: string; flTarget: string };
export type ParsedTab = { name: string; meta: ParsedMeta; lines: ParsedLine[]; skipped: number };

const CATS = ["F&L", "Boulang", "Sec", "Frais", "Plats préparés", "Hygiène", "Autre"];
const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%&# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Cell = ExcelJS.Cell;
/** Valeur lisible d'une cellule : résultat d'une formule, texte riche, date ; les erreurs (#REF!, #DIV/0!) deviennent vides. */
function val(c: Cell | undefined): string | number | Date | null {
  if (!c) return null;
  let v = c.value as unknown;
  if (v == null) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown; hyperlink?: unknown };
    if (o.error) return null;
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("result" in o) v = o.result;
    else if (o.text != null) v = o.text;
    else return null;
    if (v != null && typeof v === "object" && !(v instanceof Date)) return null;
  }
  if (typeof v === "string" && /^#(REF|DIV\/0|N\/A|VALUE|NAME|NUM)/i.test(v.trim())) return null;
  return (v as string | number | Date | null) ?? null;
}
const text = (c: Cell | undefined) => {
  const v = val(c);
  if (v == null) return "";
  if (v instanceof Date) return "";
  return String(v).trim();
};
const isPct = (c: Cell | undefined) => /%/.test(String(c?.numFmt ?? ""));
function numStr(c: Cell | undefined): string {
  const v = val(c);
  if (v == null || v instanceof Date) return "";
  let n = typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return "";
  if (isPct(c) && n <= 1) n = n * 100; // « 100 % » est stocké 1 dans Excel
  return String(Math.round(n * 1000) / 1000);
}
function isoOf(v: string | number | Date | null): string | null {
  if (v == null) return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  const m = String(v).match(/(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

function mapCategory(raw: string): string {
  const n = norm(raw);
  if (!n) return "Autre";
  if (/f&l|fruit|legume/.test(n)) return "F&L";
  if (/boulang|pain|viennois/.test(n)) return "Boulang";
  if (/^sec|epicerie|feculent/.test(n)) return "Sec";
  if (/frais|laitier|cremerie|viande|poisson/.test(n)) return "Frais";
  if (/plat|resto|cuisin|traiteur/.test(n)) return "Plats préparés";
  if (/hyg/.test(n)) return "Hygiène";
  return CATS.includes(raw) ? raw : "Autre";
}
const DELIVERY = ["Collecte Log", "Reste camion", "Livraison sur site", "Sortie stock", "Stockage sur place"];
function mapOption(raw: string, list: string[]): string {
  const n = norm(raw);
  if (!n) return "";
  return list.find((o) => norm(o) === n) ?? list.find((o) => n.includes(norm(o)) || norm(o).includes(n)) ?? "";
}

function parseSheet(ws: ExcelJS.Worksheet): ParsedTab | null {
  const lastRow = Math.min(ws.rowCount, 200);
  // 1) ligne d'en-tête du tableau : celle qui contient « Catégorie » ET « Produit »
  let headerRow = -1;
  const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(lastRow, 80) && headerRow < 0; r++) {
    const row = ws.getRow(r);
    const cells = new Map<number, string>();
    row.eachCell({ includeEmpty: false }, (c, n) => cells.set(n, norm(val(c))));
    const hasCat = [...cells.values()].some((t) => t === "categorie");
    const hasProd = [...cells.values()].some((t) => t === "produit");
    if (hasCat && hasProd) {
      headerRow = r;
      for (const [n, t] of cells) {
        if (t === "categorie") col.category = n;
        else if (t === "produit") col.product = n;
        else if (t === "nb colis") col.nb_colis = n;
        else if (t === "pds colis" || t === "poids colis") col.colis_weight_kg = n;
        else if (/^poids( kg)?$/.test(t)) col.weight_kg = n;
        else if (t === "fournisseur") col.supplier = n;
        else if (/^% ?don$|^don ?%$/.test(t)) col.don_pct = n;
        else if (t === "mode de livraison") col.delivery_mode = n;
        else if (t === "label eco") col.eco_label = n;
        else if (t === "label geo") col.geo_label = n;
      }
    }
  }
  if (headerRow < 0 || !col.product) return null;

  // 2) bloc d'informations au-dessus du tableau : libellé dans une cellule, valeur dans la suivante non vide
  const meta: ParsedMeta = { distribution: "", date: null, baskets: "", registered: "", presence: "", flTarget: "" };
  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r);
    const cells: { n: number; c: Cell }[] = [];
    row.eachCell({ includeEmpty: false }, (c, n) => cells.push({ n, c }));
    cells.forEach(({ n, c }, idx) => {
      const label = norm(val(c));
      if (!label) return;
      const next = cells.slice(idx + 1).find((x) => val(x.c) != null && String(val(x.c)).trim() !== "")?.c;
      const below = ws.getRow(r + 1).getCell(n); // certains chiffres sont sous leur libellé (« # de colis », « F&L cible »)
      if (label === "distribution" && next) meta.distribution = text(next);
      else if (label === "date" && next) meta.date = isoOf(val(next));
      else if (/colis/.test(label) && !/pds|poids|nb/.test(label) && !meta.baskets) meta.baskets = numStr(below) || (next ? numStr(next) : "");
      else if (/inscrit/.test(label) && next) meta.registered = numStr(next);
      else if (/taux/.test(label) && /presence/.test(label) && next) meta.presence = numStr(next);
      else if (/cible/.test(label) && !meta.flTarget) meta.flTarget = numStr(below) || (next ? numStr(next) : "");
    });
  }

  // 3) lignes produits, jusqu'au tableau récapitulatif (« produits … » / « total ») ou 80 lignes
  const lines: ParsedLine[] = [];
  let skipped = 0;
  for (let r = headerRow + 1; r <= Math.min(lastRow, headerRow + 80); r++) {
    const row = ws.getRow(r);
    const first = norm(val(row.getCell(1)));
    if (first === "produits" || first.startsWith("recap") || first === "total") break;
    const product = text(row.getCell(col.product));
    if (!product) continue;
    const nb = numStr(row.getCell(col.nb_colis ?? 0));
    const w = numStr(row.getCell(col.weight_kg ?? 0));
    const cw = numStr(row.getCell(col.colis_weight_kg ?? 0));
    if ((!nb || +nb === 0) && (!w || +w === 0)) {
      skipped++; // ligne du modèle sans quantité
      continue;
    }
    lines.push({
      category: mapCategory(text(row.getCell(col.category ?? 0))),
      product,
      nb_colis: nb,
      colis_weight_kg: cw,
      weight_kg: w,
      supplier: text(row.getCell(col.supplier ?? 0)),
      don_pct: numStr(row.getCell(col.don_pct ?? 0)),
      delivery_mode: mapOption(text(row.getCell(col.delivery_mode ?? 0)), DELIVERY),
      eco_label: mapOption(text(row.getCell(col.eco_label ?? 0)), ["BIO", "HVE"]),
      geo_label: mapOption(text(row.getCell(col.geo_label ?? 0)), ["Local", "France", "Monde"]),
    });
  }
  return { name: ws.name, meta, lines, skipped };
}

/** Lit tous les onglets du classeur : la liste complète de ses onglets (dans l'ordre du fichier) et ceux qui ressemblent à une feuille de distribution. */
export async function parseDistribWorkbook(buf: ArrayBuffer | Buffer): Promise<{ tabs: ParsedTab[]; sheetNames: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const out: ParsedTab[] = [];
  wb.eachSheet((ws) => {
    try {
      const t = parseSheet(ws);
      if (t) out.push(t);
    } catch {
      /* onglet illisible : ignoré */
    }
  });
  return { tabs: out, sheetNames: wb.worksheets.map((ws) => ws.name) };
}
