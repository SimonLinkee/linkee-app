import QRCode from "qrcode";

// Le support A4 « QR code » d'un partenaire : logo Linkee, un seul QR code (le lien de déclaration du partenaire), son logo.
// Tout est dessiné dans le navigateur (canvas) : aucun envoi vers un service extérieur.

const W = 1240; // A4 à 150 dpi
const H = 1754;
const NAVY = "#001641", CREAM = "#fdf4ed", TURQ = "#4fc1d6", SLATE = "#4d5c7a", LINE = "#eadfd2", ORANGE = "#eb6834";
const FONT = "Arial, Helvetica, sans-serif";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "•";

/** Dessine le support (canvas A4 1240×1754). `logoUrl` vide ou illisible : un rond avec les initiales du partenaire. */
export async function drawSupport(o: { url: string; name: string; logoUrl?: string | null }): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const text = (t: string, y: number, size: number, color: string, bold = false, maxW = W - 160) => {
    let s = size;
    ctx.font = `${bold ? "bold " : ""}${s}px ${FONT}`;
    while (ctx.measureText(t).width > maxW && s > 18) {
      s -= 2;
      ctx.font = `${bold ? "bold " : ""}${s}px ${FONT}`;
    }
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillText(t, W / 2, y);
  };

  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, 380);

  const [linkee, partnerLogo] = await Promise.all([loadImage("/linkee-logo-clair.png"), o.logoUrl ? loadImage(o.logoUrl) : Promise.resolve(null)]);
  if (linkee) {
    const lw = 520;
    ctx.drawImage(linkee, (W - lw) / 2, 70, lw, (linkee.height * lw) / linkee.width);
  }
  text("ANTI-GASPI · COLLECTES · DISTRIBUTIONS", 318, 26, TURQ, true);
  text("Vous avez un don à nous confier ?", 430, 60, NAVY, true);
  text("Scannez le QR code pour déclarer votre don", 515, 38, SLATE);

  // le QR code, dans une carte blanche arrondie
  const qs = 640;
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, o.url, { errorCorrectionLevel: "Q", margin: 0, width: qs, color: { dark: NAVY, light: "#ffffff" } });
  const cx = (W - qs) / 2 - 50;
  roundRect(ctx, cx, 610, qs + 100, qs + 100, 48);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = LINE;
  ctx.stroke();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, (W - qs) / 2, 660, qs, qs);
  ctx.imageSmoothingEnabled = true;

  text("Aucune application à installer, aucun compte à créer.", 1415, 30, SLATE);
  ctx.fillStyle = LINE;
  ctx.fillRect(160, 1493, W - 320, 3);

  // le logo du partenaire (ou ses initiales)
  const py = 1512;
  if (partnerLogo) {
    const maxW = 420, maxH = 120;
    const k = Math.min(maxW / partnerLogo.width, maxH / partnerLogo.height);
    const lw = partnerLogo.width * k, lh = partnerLogo.height * k;
    ctx.drawImage(partnerLogo, (W - lw) / 2, py + (maxH - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(W / 2, py + 60, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 50px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(o.name), W / 2, py + 62);
  }
  text(o.name, py + 130, 34, NAVY, true);
  text("Partenaire anti-gaspi avec Linkee", py + 178, 26, SLATE);
  return canvas;
}

export const canvasToPng = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Image non créée"))), "image/png"));

/** PDF A4 d'une page contenant l'image du support (PDF minimal, sans bibliothèque). */
export async function canvasToPdf(c: HTMLCanvasElement): Promise<Blob> {
  const jpeg = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Image non créée"))), "image/jpeg", 0.95));
  const img = new Uint8Array(await jpeg.arrayBuffer());
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    chunks.push(u);
    len += u.length;
  };
  const obj = (n: number, body: Uint8Array | string, pre = "", post = "") => {
    offsets[n] = len;
    push(`${n} 0 obj\n${pre}`);
    push(body);
    push(`${post}\nendobj\n`);
  };
  const PW = 595.28, PH = 841.89;
  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, img, `<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, "\nendstream");
  const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(5, content, `<< /Length ${content.length} >>\nstream\n`, "\nendstream");
  const xref = len;
  let x = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/** Nom de fichier lisible : « Support QR - Boulangerie Les Délices ». */
export const supportFileName = (name: string) => "Support QR - " + name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
