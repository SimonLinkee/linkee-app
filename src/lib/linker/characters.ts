// Links Bénévoles — character & accessory engine. Pure SVG-string generator, no React/DOM dependency
// (portable to a future mobile build). Ported from the click-through preview in mockups/links-benevoles/.
import { CATS, SCALE, STAGES, type StyleKey } from "./gamification";

export type CharKey =
  | "fraise" | "pomme" | "banane" | "cerise" | "orange" | "citron" | "kiwi" | "poire" | "pasteque" | "ananas"
  | "carotte" | "tomate" | "brocoli" | "aubergine" | "poivron" | "radis" | "petitpois" | "potiron" | "pommedeterre" | "poireau";

type Anchors = { headY: number; hatW: number; eyeY: number; eyeDX: number; neckY: number; chest: [number, number]; waistY: number; feetY: number; feetDX: number; hL: [number, number]; hR: [number, number]; bodyW: number; gr: number };
type CharDef = { n: string; e: string; kind: "fruit" | "legume"; cx: number; tones: string[]; dark: string; A: Anchors; body: string; deco: (stage: number) => string };

const star = (x: number, y: number, r: number, fill: string, rot = 0) => {
  let p = "";
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90 + rot) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.45 : r;
    p += (i ? "L" : "M") + (x + Math.cos(a) * rr).toFixed(1) + " " + (y + Math.sin(a) * rr).toFixed(1);
  }
  return `<path d="${p}Z" fill="${fill}"/>`;
};
const sparkle = (x: number, y: number, r: number, fill = "#fff") =>
  `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="${fill}"/>`;
/** A cluster of overlapping leaf blades on top of the body — the shared "stem" look for most fruits & veggies. */
function leafCrown(cx: number, topY: number, scale: number, color: string, n = 6, spread = 38) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = -90 + (i - (n - 1) / 2) * spread;
    out += `<ellipse cx="${cx}" cy="${topY - 16 * scale}" rx="${9 * scale}" ry="${24 * scale}" fill="${color}" transform="rotate(${a + 90} ${cx} ${topY})"/>`;
  }
  return out + `<circle cx="${cx}" cy="${topY - 2}" r="${6 * scale}" fill="${color}"/>`;
}
function seedDots(cx: number, cy: number, spread: number, color: string, n = 9) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = spread * (0.55 + 0.4 * ((i * 7) % 5) / 4);
    out += `<ellipse cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.7).toFixed(1)}" rx="2.4" ry="3.6" fill="${color}" opacity=".85"/>`;
  }
  return out;
}

/* ---------------- archetypal bodies (reused across several characters for a cohesive kawaii family) ---------------- */
const ROUND_A: Anchors = { headY: 82, hatW: 100, eyeY: 138, eyeDX: 27, neckY: 172, chest: [100, 182], waistY: 190, feetY: 206, feetDX: 24, hL: [36, 150], hR: [164, 150], bodyW: 128, gr: 210 };
const ROUND_BODY = "M100 86 C 158 78 174 130 162 170 C 152 200 126 208 100 208 C 74 208 48 200 38 170 C 26 130 42 78 100 86 Z";
const OVAL_A: Anchors = { headY: 50, hatW: 74, eyeY: 118, eyeDX: 16, neckY: 150, chest: [100, 168], waistY: 190, feetY: 214, feetDX: 14, hL: [60, 152], hR: [140, 152], bodyW: 80, gr: 218 };
const OVAL_BODY = "M100 52 C 128 54 141 94 139 140 C 137 182 122 212 100 216 C 78 212 63 182 61 140 C 59 94 72 54 100 52 Z";
const TALL_A: Anchors = { headY: 70, hatW: 86, eyeY: 108, eyeDX: 20, neckY: 140, chest: [100, 154], waistY: 176, feetY: 220, feetDX: 12, hL: [58, 120], hR: [142, 120], bodyW: 90, gr: 224 };
const TALL_BODY = "M58 92 C 58 66 142 66 142 92 C 142 132 118 196 100 222 C 82 196 58 132 58 92 Z";
const TREE_A: Anchors = { headY: 64, hatW: 108, eyeY: 122, eyeDX: 26, neckY: 156, chest: [100, 166], waistY: 186, feetY: 214, feetDX: 22, hL: [40, 148], hR: [160, 148], bodyW: 118, gr: 216 };
const TREE_BODY = "M100 70 C 150 66 168 112 156 152 C 148 182 124 210 100 210 C 76 210 52 182 44 152 C 32 112 50 66 100 70 Z";

function ringDecoBase(A: Anchors, seed: number) { return { A, seed }; }

/* ---------------- the 4 hand-drawn "flagship" characters (fraise / banane / carotte / tomate) ---------------- */
const CH_BASE: Record<"fraise" | "banane" | "carotte" | "tomate", CharDef> = {
  fraise: {
    n: "Fraise", e: "🍓", kind: "fruit", cx: 100, tones: ["#ff9db0", "#ff8298", "#f2455e", "#e6304b", "#dc2140", "#ea1f45"], dark: "#b8163a",
    A: { headY: 52, hatW: 96, eyeY: 120, eyeDX: 25, neckY: 154, chest: [100, 170], waistY: 190, feetY: 216, feetDX: 22, hL: [44, 154], hR: [156, 154], bodyW: 112, gr: 220 },
    body: "M100 66 C 44 64 36 128 62 176 C 78 206 92 216 100 216 C 108 216 122 206 138 176 C 164 128 156 64 100 66 Z",
    deco(st) {
      const seeds: [number, number][] = [[76, 94], [124, 94], [100, 90], [52, 120], [148, 120], [60, 152], [140, 152], [84, 176], [116, 176], [100, 196], [100, 162]];
      const lf = ["#8fd68a", "#6cc76a", "#4fb752", "#3ea34a", "#2f9440", "#3aa54a"][st];
      return seeds.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4.2" fill="#ffe7a1" opacity=".9"/>`).join("") + leafCrown(100, 66, 1 + st * 0.06, lf);
    },
  },
  banane: {
    n: "Banane", e: "🍌", kind: "fruit", cx: 100, tones: ["#fff2a8", "#ffe982", "#ffd93d", "#ffcd1c", "#ffc200", "#ffc700"], dark: "#d99a00",
    A: OVAL_A,
    body: OVAL_BODY,
    deco(st) {
      const br = ["#c08a4a", "#b07a3c", "#9b6a30", "#8a5a26", "#7a4c1e", "#8a5a26"][st];
      return `<path d="M124 70 C 134 100 134 150 122 196" fill="none" stroke="#e0a800" stroke-width="3" opacity=".45" stroke-linecap="round"/>
        <path d="M76 74 C 66 104 66 152 78 198" fill="none" stroke="#fff" stroke-width="3" opacity=".35" stroke-linecap="round"/>
        <rect x="93" y="30" width="14" height="24" rx="5" fill="${br}"/><rect x="90" y="26" width="20" height="9" rx="4" fill="#7a4c1e"/>
        <ellipse cx="100" cy="214" rx="10" ry="5" fill="#7a4c1e"/>`;
    },
  },
  carotte: {
    n: "Carotte", e: "🥕", kind: "legume", cx: 100, tones: ["#ffc78f", "#ffb06a", "#ff9536", "#ff8214", "#f56f00", "#ff7600"], dark: "#c85800",
    A: TALL_A,
    body: TALL_BODY,
    deco(st) {
      const lf = ["#8fd68a", "#6cc76a", "#4fb752", "#3ea34a", "#2f9440", "#3aa54a"][st];
      const s = 1 + st * 0.06;
      const leaf = (dx: number, ang: number, len: number) =>
        `<path d="M100 76 C ${100 + dx * 0.4} ${76 - len * 0.5} ${100 + dx} ${76 - len * 0.8} ${100 + dx * 1.2} ${76 - len} C ${100 + dx * 0.2} ${76 - len * 0.7} 98 ${76 - len * 0.3} 100 76 Z" fill="${lf}" transform="rotate(${ang} 100 76)"/>`;
      return `<path d="M72 112 L88 112 M116 140 L130 140 M86 150 L96 150 M104 176 L114 176 M92 190 L98 190" stroke="#d96a00" stroke-width="3" stroke-linecap="round" opacity=".4"/>` +
        leaf(-26 * s, -18, 46 * s) + leaf(26 * s, 18, 46 * s) + leaf(0, 0, 56 * s);
    },
  },
  tomate: {
    n: "Tomate", e: "🍅", kind: "legume", cx: 100, tones: ["#ffb3a3", "#ff8f7a", "#f4553c", "#e83f26", "#d93016", "#e6341a"], dark: "#b02010",
    A: ROUND_A,
    body: ROUND_BODY,
    deco(st) {
      const lf = ["#8fd68a", "#6cc76a", "#4fb752", "#3ea34a", "#2f9440", "#3aa54a"][st];
      const s = 1 + st * 0.05;
      let leaves = "";
      for (let i = 0; i < 6; i++) leaves += `<path d="M100 84 C 92 ${72 - 8 * s} 88 ${64 - 12 * s} 100 ${58 - 14 * s} C 112 ${64 - 12 * s} 108 ${72 - 8 * s} 100 84Z" fill="${lf}" transform="rotate(${i * 60 - 150} 100 84)"/>`;
      return leaves + `<circle cx="100" cy="82" r="7" fill="${lf}"/><rect x="97" y="58" width="6" height="14" rx="3" fill="#3e8a3a"/>`;
    },
  },
};
const CH = CH_BASE as unknown as Record<CharKey, CharDef>;

/* ---------------- the 16 extra characters: same 4 body families, distinct colours + a signature decoration ---------------- */
type Extra = { key: CharKey; n: string; e: string; kind: "fruit" | "legume"; arche: "round" | "oval" | "tall" | "tree"; tones: string[]; dark: string; deco: "leaf" | "stem" | "ridge" | "dots" | "cap" | "frill" | "plain"; decoColor: string };
const EXTRA: Extra[] = [
  { key: "pomme", n: "Pomme", e: "🍎", kind: "fruit", arche: "round", tones: ["#ffb0ae", "#ff8d8a", "#f2534b", "#e83a30", "#d92a1f", "#e33025"], dark: "#a3241a", deco: "leaf", decoColor: "#4fb752" },
  { key: "cerise", n: "Cerise", e: "🍒", kind: "fruit", arche: "round", tones: ["#ff9fb3", "#ff7a97", "#e83f63", "#d92850", "#c21943", "#d31e49"], dark: "#8f1233", deco: "stem", decoColor: "#6cc76a" },
  { key: "orange", n: "Orange", e: "🍊", kind: "fruit", arche: "round", tones: ["#ffcf9a", "#ffb666", "#ff9a2e", "#f5860f", "#e57600", "#f28000"], dark: "#b85e00", deco: "leaf", decoColor: "#4fb752" },
  { key: "poivron", n: "Poivron", e: "🫑", kind: "legume", arche: "round", tones: ["#b6ecb0", "#93df8c", "#5fc85c", "#3fae42", "#2c9636", "#38a53d"], dark: "#1f7028", deco: "cap", decoColor: "#3ea34a" },
  { key: "potiron", n: "Potiron", e: "🎃", kind: "legume", arche: "round", tones: ["#ffcf8a", "#ffb85c", "#ff9c20", "#f28600", "#d97600", "#e87f00"], dark: "#a35800", deco: "ridge", decoColor: "#7a4c1e" },
  { key: "petitpois", n: "Petit pois", e: "🟢", kind: "legume", arche: "round", tones: ["#cdeeb0", "#b3e28c", "#8fce5c", "#6fb83c", "#59a428", "#63ac30"], dark: "#3e7a1a", deco: "leaf", decoColor: "#4fb752" },
  { key: "citron", n: "Citron", e: "🍋", kind: "fruit", arche: "oval", tones: ["#fdf3a0", "#fbe86a", "#f7da2a", "#eecb10", "#e0bc00", "#eac400"], dark: "#a88900", deco: "leaf", decoColor: "#6cc76a" },
  { key: "kiwi", n: "Kiwi", e: "🥝", kind: "fruit", arche: "oval", tones: ["#d7e893", "#c4dd6b", "#a9c93f", "#8fb228", "#7a9c1a", "#88a922"], dark: "#546a10", deco: "dots", decoColor: "#5a3a1e" },
  { key: "pasteque", n: "Pastèque", e: "🍉", kind: "fruit", arche: "oval", tones: ["#ff9fa0", "#ff7477", "#f04a52", "#e13440", "#c92030", "#d92838"], dark: "#7a1420", deco: "stem", decoColor: "#3ea34a" },
  { key: "pommedeterre", n: "Pomme de terre", e: "🥔", kind: "legume", arche: "oval", tones: ["#e7c896", "#dcb377", "#c99a58", "#b3813f", "#9c6c2f", "#a97638"], dark: "#6b4620", deco: "plain", decoColor: "#6b4620" },
  { key: "ananas", n: "Ananas", e: "🍍", kind: "fruit", arche: "tall", tones: ["#ffe98a", "#ffd94f", "#f7c520", "#e8b000", "#d49f00", "#e0a900"], dark: "#9c7000", deco: "frill", decoColor: "#3ea34a" },
  { key: "aubergine", n: "Aubergine", e: "🍆", kind: "legume", arche: "tall", tones: ["#d9aef0", "#c286e6", "#9c53c9", "#7f38ae", "#6b2996", "#7830a3"], dark: "#3f1760", deco: "cap", decoColor: "#3ea34a" },
  { key: "poireau", n: "Poireau", e: "🧅", kind: "legume", arche: "tall", tones: ["#f2f7e6", "#e4edd0", "#cfe0ad", "#bdd48f", "#a9c476", "#b6cd80"], dark: "#5c7a3a", deco: "frill", decoColor: "#5a9e3c" },
  { key: "radis", n: "Radis", e: "🌱", kind: "legume", arche: "tall", tones: ["#ffd6e6", "#ffaecb", "#f9749f", "#ef5486", "#e23c72", "#ec4a7c"], dark: "#9c2050", deco: "leaf", decoColor: "#4fb752" },
  { key: "poire", n: "Poire", e: "🍐", kind: "fruit", arche: "tall", tones: ["#e7f0a0", "#d9e878", "#c3d84a", "#aec42e", "#98ac1e", "#a4b826"], dark: "#5e6e12", deco: "stem", decoColor: "#6b4423" },
  { key: "brocoli", n: "Brocoli", e: "🥦", kind: "legume", arche: "tree", tones: ["#bfe8a6", "#a5dc7e", "#82c651", "#67ae37", "#539626", "#5fa22f"], dark: "#2f5c16", deco: "ridge", decoColor: "#3ea34a" },
];

function decoFor(kind: Extra["deco"], color: string, A: Anchors, cx: number, st: number) {
  const scale = 1 + st * 0.05;
  switch (kind) {
    case "leaf": return leafCrown(cx, A.headY + 14, scale, color);
    case "frill": return leafCrown(cx, A.headY + 10, scale * 1.3, color, 8, 26);
    case "stem": return `<rect x="${cx - 4}" y="${A.headY - 6}" width="8" height="18" rx="4" fill="#6b4423"/><ellipse cx="${cx}" cy="${A.headY - 6}" rx="9" ry="6" fill="${color}"/>`;
    case "cap": return `<path d="M${cx - 22} ${A.headY + 16} Q${cx} ${A.headY - 6} ${cx + 22} ${A.headY + 16} Q${cx} ${A.headY + 6} ${cx - 22} ${A.headY + 16}Z" fill="${color}"/><rect x="${cx - 3}" y="${A.headY - 10}" width="6" height="12" rx="3" fill="#3e8a3a"/>`;
    case "ridge": return `<path d="M${cx - A.bodyW * 0.3} ${A.waistY - 8} V${A.headY + 30} M${cx} ${A.waistY - 4} V${A.headY + 20} M${cx + A.bodyW * 0.3} ${A.waistY - 8} V${A.headY + 30}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity=".35"/><ellipse cx="${cx}" cy="${A.headY + 4}" rx="8" ry="6" fill="${color}"/>`;
    case "dots": return seedDots(cx, (A.headY + A.waistY) / 2, A.bodyW * 0.32, color, 14);
    default: return `<circle cx="${cx - 8}" cy="${A.headY + 20}" r="3" fill="${color}" opacity=".6"/><circle cx="${cx + 10}" cy="${A.headY + 34}" r="3" fill="${color}" opacity=".6"/>`;
  }
}
const ARCHE = { round: { A: ROUND_A, body: ROUND_BODY }, oval: { A: OVAL_A, body: OVAL_BODY }, tall: { A: TALL_A, body: TALL_BODY }, tree: { A: TREE_A, body: TREE_BODY } };
for (const x of EXTRA) {
  const { A, body } = ARCHE[x.arche];
  CH[x.key] = { n: x.n, e: x.e, kind: x.kind, cx: 100, tones: x.tones, dark: x.dark, A, body, deco: (st) => decoFor(x.deco, x.decoColor, A, 100, st) };
}
export { CH };
export const CHAR_KEYS = Object.keys(CH) as CharKey[];
export const FRUITS = CHAR_KEYS.filter((k) => CH[k].kind === "fruit");
export const LEGUMES = CHAR_KEYS.filter((k) => CH[k].kind === "legume");

/* ---------------- face ---------------- */
function face(c: CharDef, st: number) {
  const A = c.A, cx = c.cx, r = [12, 10.5, 9.2, 8.6, 8.6, 8.8][st];
  const dx = A.eyeDX, ey = A.eyeY;
  const eye = (x: number) => `<ellipse cx="${x}" cy="${ey}" rx="${r * 0.86}" ry="${r}" fill="#2b1b2e"/><circle cx="${x + r * 0.3}" cy="${ey - r * 0.35}" r="${r * 0.36}" fill="#fff"/><circle cx="${x - r * 0.28}" cy="${ey + r * 0.35}" r="${r * 0.17}" fill="#fff" opacity=".9"/>`;
  const legend = st === 5 ? sparkle(cx - dx - 12, ey - 14, 5, "#fff7b0") + sparkle(cx + dx + 12, ey - 14, 5, "#fff7b0") : "";
  const mouth = st === 0 ? `<ellipse cx="${cx}" cy="${ey + 16}" rx="3.4" ry="4" fill="#7a2a3a"/>`
    : st < 3 ? `<path d="M${cx - 6} ${ey + 13} Q${cx} ${ey + 21} ${cx + 6} ${ey + 13}" fill="none" stroke="#7a2a3a" stroke-width="2.6" stroke-linecap="round"/>`
      : `<path d="M${cx - 9} ${ey + 12} Q${cx} ${ey + 26} ${cx + 9} ${ey + 12} Z" fill="#7a2a3a"/><path d="M${cx - 5} ${ey + 19} Q${cx} ${ey + 23} ${cx + 5} ${ey + 19}" fill="#ff8fa3"/>`;
  return `<g>${eye(cx - dx)}${eye(cx + dx)}
    <ellipse cx="${cx - dx - 14}" cy="${ey + 13}" rx="${st === 0 ? 9 : 7.5}" ry="${st === 0 ? 6 : 5}" fill="#ff6f9c" opacity=".55"/><ellipse cx="${cx + dx + 14}" cy="${ey + 13}" rx="${st === 0 ? 9 : 7.5}" ry="${st === 0 ? 6 : 5}" fill="#ff6f9c" opacity=".55"/>
    ${mouth}${legend}</g>`;
}

/* ---------------- accessories (3 illustrated styles: cowboy, chef, magicien) ---------------- */
const STYLE_ART: Record<StyleKey, { main: string[]; acc: string[]; cloth: string[]; pants: string[] }> = {
  cowboy: { main: ["#c0392b", "#e9c96a", "#8b5a2b", "#6b4423", "#e8b923"], acc: ["#ffffff", "#8b5a2b", "#d9b26f", "#e8b923", "#fff3b0"], cloth: ["#c9a06a", "#b98a4a", "#9a6a2f", "#7a4f22", "#d9a92a"], pants: ["#7c9cc4", "#5b80b0", "#446a9c", "#33578a", "#e8b923"] },
  chef: { main: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#fffbe8"], acc: ["#4f6df5", "#90a4ae", "#2a3a8f", "#c62828", "#e8b923"], cloth: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#fffbe8"], pants: ["#e9eef5", "#d5dde8", "#c3cfdf", "#aebbd0", "#f0e3ad"] },
  magicien: { main: ["#7b57c9", "#6a44b8", "#4f2f9a", "#3a2280", "#3a2280"], acc: ["#f6d55c", "#f6d55c", "#ffe27a", "#ffe27a", "#fff3b0"], cloth: ["#8a66d6", "#7650c4", "#5f3fae", "#4a2c94", "#3a2280"], pants: ["#6a4bb0", "#5a3da0", "#4b3190", "#3c2680", "#2f1c70"] },
  pirate: { main: ["#8b5a2b", "#6b4423", "#5c3b1a", "#4a2c12", "#e8b923"], acc: ["#c0392b", "#c0392b", "#e8b923", "#e8b923", "#fff3b0"], cloth: ["#3a3f47", "#30343b", "#282b30", "#1e2024", "#3a3f47"], pants: ["#4a3520", "#3a2a18", "#2e2010", "#22180a", "#e8b923"] },
  ninja: { main: ["#3a3a44", "#2e2e37", "#232329", "#18181c", "#3a3a44"], acc: ["#c0392b", "#c0392b", "#e8302e", "#e8302e", "#e8b923"], cloth: ["#2e2e37", "#26262d", "#1e1e23", "#141417", "#2e2e37"], pants: ["#26262d", "#1e1e23", "#18181c", "#101012", "#e8b923"] },
  astronaute: { main: ["#f0f0f2", "#e4e6e8", "#d6dadd", "#c6ccd1", "#fffbe8"], acc: ["#4f6df5", "#3a56d4", "#2a3a8f", "#1c2a6e", "#e8b923"], cloth: ["#f0f0f2", "#e4e6e8", "#d6dadd", "#c6ccd1", "#fffbe8"], pants: ["#c9d3df", "#b8c4d2", "#a5b2c2", "#93a2b5", "#f0e3ad"] },
  jardinier: { main: ["#8fd68a", "#6cc76a", "#4fb752", "#3ea34a", "#e8b923"], acc: ["#7a4c1e", "#8b5a2b", "#8b5a2b", "#6b4423", "#e8b923"], cloth: ["#c9a06a", "#b98a4a", "#9a6a2f", "#7a4f22", "#d9a92a"], pants: ["#7a9e4a", "#6a8a3c", "#5a7830", "#4a6626", "#e8b923"] },
  superheros: { main: ["#e24b4a", "#d33a39", "#c22928", "#a3201f", "#e8b923"], acc: ["#2a78d6", "#2a78d6", "#1c5aa8", "#1c5aa8", "#e8b923"], cloth: ["#e24b4a", "#d33a39", "#c22928", "#a3201f", "#e8b923"], pants: ["#1c2a6e", "#16215c", "#101a4a", "#0a1238", "#e8b923"] },
  robot: { main: ["#b8c4d2", "#9aa8b8", "#7c8b9c", "#5e6d7e", "#e8e8e8"], acc: ["#4fc1d6", "#4fc1d6", "#1f93a8", "#1f93a8", "#fff3b0"], cloth: ["#b8c4d2", "#9aa8b8", "#7c8b9c", "#5e6d7e", "#e8e8e8"], pants: ["#5e6d7e", "#4a5866", "#3a4652", "#2a3440", "#c9c9c9"] },
  fee: { main: ["#ffd6f0", "#f9b6e6", "#e896d8", "#d476c8", "#fff3b0"], acc: ["#8fd68a", "#6cc76a", "#4fb752", "#3ea34a", "#e8b923"], cloth: ["#c9a8ff", "#b58aef", "#a06fdd", "#8a56c8", "#fff3b0"], pants: ["#a8d8ff", "#8ac2f5", "#6cabe8", "#5094d8", "#fff3b0"] },
};
const NEW_STYLES = new Set<StyleKey>(["pirate", "ninja", "astronaute", "jardinier", "superheros", "robot", "fee"]);

// Signature hat shape per new style (v escalates 1→5: sobre → doré, same idiom as the 3 flagship styles).
const HAT_KIND: Record<string, "band" | "brim" | "dome" | "cowl" | "crown"> = { pirate: "brim", ninja: "cowl", astronaute: "dome", jardinier: "brim", superheros: "cowl", robot: "dome", fee: "crown" };
// A small themed glyph used on the top, badge and handheld object so each style reads consistently.
const GLYPH: Record<string, (x: number, y: number, r: number, fill: string) => string> = {
  pirate: (x, y, r, fill) => `<path d="M${x - r} ${y} L${x + r} ${y} M${x - r * 0.7} ${y - r * 0.7} L${x + r * 0.7} ${y + r * 0.7} M${x - r * 0.7} ${y + r * 0.7} L${x + r * 0.7} ${y - r * 0.7}" stroke="${fill}" stroke-width="${Math.max(1.6, r * 0.28)}" stroke-linecap="round"/><circle cx="${x}" cy="${y - r * 0.15}" r="${r * 0.55}" fill="none" stroke="${fill}" stroke-width="${Math.max(1.4, r * 0.22)}"/>`,
  ninja: (x, y, r, fill) => star(x, y, r, fill, 45),
  astronaute: (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${fill}" stroke-width="${Math.max(1.4, r * 0.24)}"/><ellipse cx="${x}" cy="${y}" rx="${r * 1.5}" ry="${r * 0.45}" fill="none" stroke="${fill}" stroke-width="${Math.max(1.2, r * 0.2)}" transform="rotate(-18 ${x} ${y})"/>`,
  jardinier: (x, y, r, fill) => `${star(x, y, r * 0.9, fill)}<circle cx="${x}" cy="${y}" r="${r * 0.32}" fill="#fffbe8"/>`,
  superheros: (x, y, r, fill) => star(x, y, r, fill),
  robot: (x, y, r, fill) => `<rect x="${x - r}" y="${y - r * 0.6}" width="${r * 2}" height="${r * 1.2}" rx="${r * 0.25}" fill="${fill}"/><circle cx="${x - r * 0.45}" cy="${y}" r="${r * 0.22}" fill="#fff"/><circle cx="${x + r * 0.45}" cy="${y}" r="${r * 0.22}" fill="#fff"/>`,
  fee: (x, y, r, fill) => sparkle(x, y, r, fill),
};
function genericAcc(cat: number, style: StyleKey, v: number, c: CharDef): string | { behind: string } {
  const S = STYLE_ART[style], A = c.A, cx = c.cx, m = S.main[v - 1], a = S.acc[v - 1], gold = v === 5, gd = "#e8b923", cloth = S.cloth[v - 1], glyph = GLYPH[style];
  const sp = (x: number, y: number, r = 4) => (gold ? sparkle(x, y, r, "#fff7b0") : "");
  switch (cat) {
    case 0: {
      const x = cx, y = A.headY, w = A.hatW, kind = HAT_KIND[style];
      const col = gold ? gd : m;
      if (v === 1) {
        // every style starts with a simple band/bandana, escalating into its signature shape from v2
        return `<g><path d="M${x - w * 0.47} ${y + 20} Q${x} ${y - 4} ${x + w * 0.47} ${y + 20} L${x + w * 0.47} ${y + 30} Q${x} ${y + 10} ${x - w * 0.47} ${y + 30}Z" fill="${col}"/>${glyph(x, y + 12, 6, a)}</g>`;
      }
      if (kind === "dome")
        return `<g><path d="M${x - w * 0.4} ${y + 16} A${w * 0.4} ${w * 0.4} 0 0 1 ${x + w * 0.4} ${y + 16} Z" fill="${col}" stroke="${a}" stroke-width="2"/><path d="M${x - w * 0.42} ${y + 14} Q${x} ${y + 24} ${x + w * 0.42} ${y + 14}" fill="none" stroke="${a}" stroke-width="${v >= 3 ? 4 : 2.4}" opacity="${v >= 3 ? 0.9 : 0.5}"/>${v >= 4 ? glyph(x + w * 0.3, y - 2, 4, gold ? "#fff3b0" : a) : ""}${sp(x, y - w * 0.3, 5)}</g>`;
      if (kind === "cowl")
        return `<g><path d="M${x - w * 0.44} ${y + 22} Q${x - w * 0.5} ${y - w * 0.2} ${x} ${y - w * 0.24} Q${x + w * 0.5} ${y - w * 0.2} ${x + w * 0.44} ${y + 22} Q${x} ${y + 30} ${x - w * 0.44} ${y + 22}Z" fill="${col}"/>${v >= 3 ? `<path d="M${x - w * 0.3} ${y - w * 0.16} L${x - w * 0.1} ${y - w * 0.3} L${x} ${y - w * 0.14}Z M${x + w * 0.3} ${y - w * 0.16} L${x + w * 0.1} ${y - w * 0.3} L${x} ${y - w * 0.14}Z" fill="${col}"/>` : ""}<path d="M${x - w * 0.2} ${y + 6} Q${x} ${y + 16} ${x + w * 0.2} ${y + 6}" fill="none" stroke="${a}" stroke-width="2.2"/>${sp(x + w * 0.4, y - 4, 5)}</g>`;
      if (kind === "crown")
        return `<g><path d="M${x - w * 0.4} ${y + 18} L${x - w * 0.4} ${y + 4} L${x - w * 0.2} ${y + 14} L${x} ${y - 6} L${x + w * 0.2} ${y + 14} L${x + w * 0.4} ${y + 4} L${x + w * 0.4} ${y + 18}Z" fill="${col}" stroke="${a}" stroke-width="1.6"/>${v >= 3 ? `<circle cx="${x}" cy="${y + 2}" r="4.5" fill="${gold ? '#fff3b0' : a}"/>` : ""}${sp(x - w * 0.3, y - 2, 4)}${sp(x + w * 0.3, y + 6, 4)}</g>`;
      // brim (pirate tricorne / jardinier straw hat)
      return `<g><ellipse cx="${x}" cy="${y + 16}" rx="${w * 0.64}" ry="${w * 0.14}" fill="${style === "jardinier" ? "#e6c25f" : col}"/><path d="M${x - w * 0.3} ${y + 16} Q${x - w * 0.34} ${y - w * 0.16} ${x} ${y - w * 0.18} Q${x + w * 0.34} ${y - w * 0.16} ${x + w * 0.3} ${y + 16}Z" fill="${col}"/>${v >= 3 && style === "pirate" ? `<path d="M${x - w * 0.28} ${y + 4} Q${x} ${y - w * 0.1} ${x + w * 0.28} ${y + 4}" fill="none" stroke="${a}" stroke-width="2"/>${glyph(x, y + 4, 6, a)}` : ""}${sp(x, y - w * 0.18, 5)}</g>`;
    }
    case 1: {
      const y = A.eyeY, dx = A.eyeDX, r = 14;
      const rim = gold ? gd : a, lens = m, op = 0.4;
      const square = v === 4;
      const one = (x: number) => (square
        ? `<rect x="${x - r}" y="${y - r + 3}" width="${r * 2}" height="${r * 1.5}" rx="4" fill="${lens}" fill-opacity="${op}" stroke="${rim}" stroke-width="3"/>`
        : `<circle cx="${x}" cy="${y}" r="${r}" fill="${lens}" fill-opacity="${op}" stroke="${rim}" stroke-width="${v >= 3 ? 4 : 3}"/>`);
      return `<g>${one(c.cx - dx)}${one(c.cx + dx)}<path d="M${c.cx - dx + r} ${y} Q${c.cx} ${y - 5} ${c.cx + dx - r} ${y}" fill="none" stroke="${rim}" stroke-width="3"/>${sp(c.cx + dx + r, y - r, 5)}</g>`;
    }
    case 2: {
      const y0 = A.neckY, y1 = A.waistY;
      return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${cloth}"/><rect x="0" y="${y0}" width="200" height="4" fill="${gold ? gd : a}"/><path d="M${cx} ${y0} V${y1}" stroke="${a}" stroke-width="2" opacity=".6"/>${[[-24, 12], [22, 18], [0, 26]].map(([dx, dy]) => glyph(cx + dx, y0 + dy, 4.4, a)).join("")}${sp(cx + 30, y0 + 24, 5)}</g>`;
    }
    case 3: {
      const y0 = A.waistY, y1 = A.gr + 6;
      const belt = `<rect x="0" y="${y0}" width="200" height="5" fill="${gold ? gd : "#2b2b2b"}" opacity=".85"/><rect x="${cx - 6}" y="${y0 - 1}" width="12" height="7" rx="2" fill="${gold ? "#fff3b0" : a}"/>`;
      return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${S.pants[v - 1]}"/><path d="M${cx} ${y0 + 6} V${y1}" stroke="${a}" stroke-width="2" opacity=".4"/>${belt}</g>`;
    }
    case 4: {
      const y = A.feetY, dx = A.feetDX;
      const shoe = (x: number) => `<g><path d="M${x - 13} ${y - 6} q 0 -8 10 -8 h 8 q 8 0 8 8 v 8 h -26 z" fill="${m}"/><rect x="${x - 13}" y="${y + 2}" width="26" height="5" rx="2" fill="${gold ? gd : a}"/>${gold ? sparkle(x + 10, y - 10, 4, "#fff7b0") : ""}</g>`;
      return `<g>${shoe(c.cx - dx)}${shoe(c.cx + dx)}</g>`;
    }
    case 5: {
      const y = A.neckY, w = A.bodyW * 0.55;
      if (style === "superheros" || style === "fee")
        return { behind: `<path d="M${cx - w} ${y - 6} Q${cx - w - 20} ${A.gr - 24} ${cx - w - 10} ${A.gr + 4} L${cx + w + 10} ${A.gr + 4} Q${cx + w + 20} ${A.gr - 24} ${cx + w} ${y - 6}Z" fill="${m}"/><path d="M${cx - w - 6} ${A.gr - 2} L${cx + w + 6} ${A.gr - 2}" stroke="${gold ? gd : a}" stroke-width="4"/>${gold ? sparkle(cx, A.gr - 40, 6, "#fff7b0") : ""}` };
      return `<g><path d="M${cx - w * 0.7} ${y - 2} Q${cx} ${y + 14} ${cx + w * 0.7} ${y - 2} L${cx + 8} ${y + 30} Q${cx} ${y + 38} ${cx - 8} ${y + 30}Z" fill="${m}"/>${sp(cx + w * 0.65, y, 4)}</g>`;
    }
    case 6: {
      const x = cx - A.bodyW * 0.5 - 6, y = A.waistY - 4;
      return `<g><path d="M${cx + A.bodyW * 0.3} ${A.neckY - 6} L${x + 6} ${y}" stroke="${a}" stroke-width="4" clip-path="url(#clip)"/><path d="M${x - 14} ${y + 8} q 0 -6 14 -6 q 14 0 14 6 l -3 16 h -22z" fill="${m}"/>${sp(x + 12, y + 16, 4)}</g>`;
    }
    case 7: {
      const g = ([x, y]: [number, number]) => `<circle cx="${x}" cy="${y}" r="11" fill="${m}" stroke="${a}" stroke-width="2"/>${gold ? sparkle(x, y - 2, 4, "#fff3b0") : ""}`;
      return `<g>${g(A.hL)}${g(A.hR)}</g>`;
    }
    case 8: {
      const x = cx + A.bodyW * 0.3, y = A.chest[1] - 8, R = 9 + v;
      return `<g><circle cx="${x}" cy="${y}" r="${R}" fill="#fff" stroke="${gold ? gd : a}" stroke-width="3"/>${glyph(x, y, R * 0.6, m)}</g>`;
    }
    default: {
      const [x, y] = A.hR;
      const len = 30 + v * 5;
      return `<g transform="translate(${x + 8} ${y + 2}) rotate(16)"><rect x="-3" y="${-len}" width="6" height="${len + 12}" rx="3" fill="${v >= 4 ? (gold ? gd : m) : m}"/>${v > 1 ? glyph(0, -len - 6, 7 + v, gold ? gd : a) : ""}${gold ? sparkle(16, -len - 16, 5, "#fff7b0") : ""}</g>`;
    }
  }
}

function acc(cat: number, style: StyleKey, v: number, c: CharDef): string | { behind: string } {
  if (NEW_STYLES.has(style)) return genericAcc(cat, style, v, c);
  const S = STYLE_ART[style], A = c.A, cx = c.cx, m = S.main[v - 1], a = S.acc[v - 1], gold = v === 5, gd = "#e8b923", trim = gold ? gd : a, cloth = S.cloth[v - 1];
  const sp = (x: number, y: number, r = 4) => (gold ? sparkle(x, y, r, "#fff7b0") : "");
  switch (cat) {
    case 0: {
      const x = cx, y = A.headY, w = A.hatW;
      if (style === "cowboy") {
        if (v === 1) return `<g><path d="M${x - w * 0.47} ${y + 22} Q${x} ${y - 2} ${x + w * 0.47} ${y + 22} L${x + w * 0.47} ${y + 34} Q${x} ${y + 12} ${x - w * 0.47} ${y + 34}Z" fill="${m}"/>${[-0.28, -0.08, 0.12, 0.3].map((t, i) => `<circle cx="${x + w * t}" cy="${y + 19 + (i % 2) * 4}" r="2.4" fill="#fff"/>`).join("")}<path d="M${x + w * 0.44} ${y + 26} l 10 -4 l -2 12 z M${x + w * 0.44} ${y + 26} l 10 12 l -12 -2z" fill="${m}"/></g>`;
        if (v === 2) return `<g><ellipse cx="${x}" cy="${y + 16}" rx="${w * 0.7}" ry="${w * 0.13}" fill="#e6c25f"/><path d="M${x - w * 0.3} ${y + 16} Q${x - w * 0.34} ${y - w * 0.14} ${x} ${y - w * 0.16} Q${x + w * 0.34} ${y - w * 0.14} ${x + w * 0.3} ${y + 16}Z" fill="#f3d97f"/><rect x="${x - w * 0.3}" y="${y + 4}" width="${w * 0.6}" height="7" fill="#c0392b"/><path d="M${x - w * 0.5} ${y + 16} h ${w}" stroke="#d1a94a" stroke-width="2" opacity=".6"/></g>`;
        const col = v === 5 ? gd : v === 4 ? "#8b5a2b" : "#7a4a22", band = v === 5 ? "#a07510" : "#3f2612";
        return `<g><path d="M${x - w * 0.74} ${y + 10} Q${x - w * 0.5} ${y + 26} ${x} ${y + 20} Q${x + w * 0.5} ${y + 26} ${x + w * 0.74} ${y + 10} Q${x + w * 0.46} ${y + 6} ${x} ${y + 8} Q${x - w * 0.46} ${y + 6} ${x - w * 0.74} ${y + 10}Z" fill="${col}"/>
          <path d="M${x - w * 0.31} ${y + 10} Q${x - w * 0.34} ${y - w * 0.22} ${x - w * 0.1} ${y - w * 0.17} Q${x} ${y - w * 0.08} ${x + w * 0.1} ${y - w * 0.17} Q${x + w * 0.34} ${y - w * 0.22} ${x + w * 0.31} ${y + 10}Z" fill="${col}"/>
          <rect x="${x - w * 0.31}" y="${y + 1}" width="${w * 0.62}" height="7" fill="${band}"/>${v >= 4 ? star(x, y + 4.5, 7, v === 5 ? "#fff3b0" : gd) : `<rect x="${x - 4}" y="${y + 1}" width="8" height="7" rx="1.5" fill="#d9b26f"/>`}${sp(x - w * 0.5, y - 4, 5)}${sp(x + w * 0.52, y + 6, 4)}</g>`;
      }
      if (style === "chef") {
        if (v === 1) return `<g><path d="M${x - w * 0.47} ${y + 22} Q${x} ${y - 2} ${x + w * 0.47} ${y + 22} L${x + w * 0.47} ${y + 34} Q${x} ${y + 12} ${x - w * 0.47} ${y + 34}Z" fill="#fff" stroke="#dfe6ee"/>${[-0.28, -0.08, 0.12, 0.3].map((t, i) => `<rect x="${x + w * t - 3}" y="${y + 16 + (i % 2) * 4}" width="6" height="6" fill="${a}" opacity=".8"/>`).join("")}</g>`;
        const h = v === 2 ? w * 0.3 : w * 0.52;
        const puff = v >= 3 ? `<circle cx="${x - w * 0.2}" cy="${y - h + 6}" r="${w * 0.2}" fill="#fff" stroke="#e3e9f0"/><circle cx="${x + w * 0.2}" cy="${y - h + 6}" r="${w * 0.2}" fill="#fff" stroke="#e3e9f0"/><circle cx="${x}" cy="${y - h - 2}" r="${w * 0.24}" fill="#fff" stroke="#e3e9f0"/>` : `<ellipse cx="${x}" cy="${y - h + 4}" rx="${w * 0.34}" ry="${w * 0.14}" fill="#fff" stroke="#e3e9f0"/>`;
        const stars = v === 4 ? star(x, y - h * 0.35, 6, "#c62828") : v === 5 ? star(x - 14, y - h * 0.35, 5, gd) + star(x, y - h * 0.5, 6, gd) + star(x + 14, y - h * 0.35, 5, gd) : "";
        return `<g>${puff}<path d="M${x - w * 0.3} ${y + 14} L${x - w * 0.32} ${y - h + 8} L${x + w * 0.32} ${y - h + 8} L${x + w * 0.3} ${y + 14}Z" fill="#fff" stroke="#e3e9f0"/><path d="M${x - w * 0.12} ${y + 12} V${y - h + 12} M${x + w * 0.12} ${y + 12} V${y - h + 12}" stroke="#e3e9f0"/>
          <rect x="${x - w * 0.3}" y="${y + 4}" width="${w * 0.6}" height="10" rx="2" fill="${v === 5 ? gd : v >= 3 ? a : "#dfe6ee"}"/>${stars}${sp(x + w * 0.38, y - h, 5)}</g>`;
      }
      if (v === 1) return `<g><path d="M${x - w * 0.5} ${y + 24} Q${x} ${y - 2} ${x + w * 0.5} ${y + 24} L${x + w * 0.5} ${y + 34} Q${x} ${y + 10} ${x - w * 0.5} ${y + 34}Z" fill="${m}"/>${star(x, y + 15, 8, a)}</g>`;
      const hh = [0, 0, w * 0.62, w * 0.95, w * 1.1, w * 1.25][v - 1] || w * 0.5;
      const hc = v === 5 ? "#3a2280" : m;
      return `<g><ellipse cx="${x}" cy="${y + 14}" rx="${w * 0.62}" ry="${w * 0.12}" fill="${v === 5 ? "#2b1868" : hc}"/>
        <path d="M${x - w * 0.36} ${y + 14} Q${x - w * 0.3} ${y - hh * 0.5} ${x + w * 0.05 + v * 2} ${y - hh} Q${x + w * 0.3} ${y - hh * 0.45} ${x + w * 0.36} ${y + 14}Z" fill="${hc}"/>
        <path d="M${x - w * 0.36} ${y + 14} Q${x} ${y + 20} ${x + w * 0.36} ${y + 14} L${x + w * 0.35} ${y + 5} Q${x} ${y + 12} ${x - w * 0.35} ${y + 5}Z" fill="${v >= 4 ? gd : a}"/>
        ${star(x - w * 0.12, y - hh * 0.35, 5, a)}${star(x + w * 0.14, y - hh * 0.1, 4, a)}${v >= 4 ? `<path d="M${x + 4} ${y - hh * 0.62} a 9 9 0 1 0 8 12 a 7 7 0 1 1 -8 -12z" fill="${gd}"/>` : ""}${sp(x + w * 0.1, y - hh - 4, 6)}${sp(x - w * 0.45, y - 4, 5)}</g>`;
    }
    case 1: {
      const y = A.eyeY, dx = A.eyeDX, r = 15, rim = v === 5 ? gd : style === "cowboy" ? "#3a2612" : style === "chef" ? (v === 1 ? "#b8c4d2" : a) : a;
      const lens = style === "cowboy" ? "#222" : style === "chef" ? "#bfe9ff" : "#c9a8ff", op = style === "cowboy" ? 0.6 : 0.4;
      const shape = ["round", "square", "round", "star", "round"][v - 1];
      const one = (x: number) => shape === "star" ? `<g>${star(x, y, r + 3, rim)}${star(x, y, r - 2, lens)}</g>` : shape === "square" ? `<rect x="${x - r}" y="${y - r + 3}" width="${r * 2}" height="${r * 1.6}" rx="5" fill="${lens}" fill-opacity="${op}" stroke="${rim}" stroke-width="3"/>` : `<circle cx="${x}" cy="${y}" r="${r}" fill="${lens}" fill-opacity="${op}" stroke="${rim}" stroke-width="${v === 3 ? 4.5 : 3}"/>`;
      if (style === "magicien" && v === 1) return `<g><circle cx="${c.cx + dx}" cy="${y}" r="${r}" fill="#fff" fill-opacity=".25" stroke="${gd}" stroke-width="3"/><path d="M${c.cx + dx + r} ${y + 4} Q${c.cx + dx + r + 16} ${y + 34} ${c.cx + dx + 8} ${y + 52}" fill="none" stroke="${gd}" stroke-width="1.6"/></g>`;
      return `<g>${one(c.cx - dx)}${one(c.cx + dx)}<path d="M${c.cx - dx + r} ${y} Q${c.cx} ${y - 5} ${c.cx + dx - r} ${y}" fill="none" stroke="${rim}" stroke-width="3"/>${sp(c.cx + dx + r, y - r, 5)}</g>`;
    }
    case 2: {
      const y0 = A.neckY, y1 = A.waistY;
      if (style === "cowboy") return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${cloth}"/><path d="M${cx} ${y0} L${cx - 14} ${y1} M${cx} ${y0} L${cx + 14} ${y1}" stroke="${v >= 4 ? gd : "#5c3b1a"}" stroke-width="3"/><path d="M${cx - 14} ${y0} L${cx} ${y0 + 28} L${cx + 14} ${y0}" fill="#f6dfc0"/>${[0, 1, 2].map((i) => `<circle cx="${cx + (i % 2 ? 5 : -5)}" cy="${y0 + 10 + i * 9}" r="2.4" fill="${v >= 3 ? gd : "#e8d3a0"}"/>`).join("")}<rect x="0" y="${y0}" width="200" height="4" fill="${v >= 3 ? trim : "#8b5a2b"}" opacity=".7"/></g>`;
      if (style === "chef") return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="#fff"/><rect x="0" y="${y0}" width="200" height="4" fill="${v >= 3 ? a : "#dfe6ee"}"/><path d="M${cx} ${y0} V${y1}" stroke="#dfe6ee" stroke-width="2"/>${[0, 1, 2].map((i) => `<circle cx="${cx - 9}" cy="${y0 + 10 + i * 9}" r="2.6" fill="${v === 5 ? gd : v >= 3 ? a : "#b8c4d2"}"/><circle cx="${cx + 9}" cy="${y0 + 10 + i * 9}" r="2.6" fill="${v === 5 ? gd : v >= 3 ? a : "#b8c4d2"}"/>`).join("")}</g>`;
      return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${cloth}"/><rect x="0" y="${y0}" width="200" height="4" fill="${v >= 3 ? gd : a}"/><path d="M${cx} ${y0} V${y1}" stroke="${a}" stroke-width="2"/>${[[-26, 12], [24, 20], [-8, 28], [14, 8]].map(([dx, dy]) => star(cx + dx, y0 + dy, 4.2, a)).join("")}${v === 5 ? sparkle(cx + 30, y0 + 26, 5, "#fff7b0") : ""}</g>`;
    }
    case 3: {
      const y0 = A.waistY, y1 = A.gr + 6;
      const base = S.pants[v - 1];
      const belt = style === "cowboy" ? `<rect x="0" y="${y0}" width="200" height="6" fill="#4a2c12"/><rect x="${cx - 6}" y="${y0 - 1}" width="12" height="8" rx="2" fill="${v >= 3 ? gd : "#d9b26f"}"/>` : `<rect x="0" y="${y0}" width="200" height="5" fill="${style === "chef" ? a : gd}" opacity=".85"/>`;
      const pat = style === "chef" ? Array.from({ length: 8 }, (_, i) => `<rect x="${44 + i * 16}" y="${y0 + 6}" width="8" height="${y1 - y0}" fill="${v >= 3 ? a : "#b8c4d2"}" opacity=".35"/>`).join("") : style === "magicien" ? [[-30, 14], [24, 10], [-6, 20]].map(([dx, dy]) => star(cx + dx, y0 + dy + 6, 3.4, a)).join("") : `<path d="M${cx} ${y0 + 6} V${y1}" stroke="#2e4a75" stroke-width="2" opacity=".5"/>`;
      return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${base}"/>${pat}${belt}</g>`;
    }
    case 4: {
      const y = A.feetY, dx = A.feetDX;
      const shoe = (x: number) => {
        if (style === "cowboy") return `<g><path d="M${x - 12} ${y - 10} h 16 v 8 h 8 q 4 0 4 5 v 4 h -30 z" fill="${v === 5 ? gd : "#7a4a22"}"/><rect x="${x - 14}" y="${y + 4}" width="7" height="5" fill="#3f2612"/><path d="M${x - 12} ${y - 10} h 16" stroke="${v >= 3 ? gd : "#5c3b1a"}" stroke-width="3"/>${v >= 3 ? `<circle cx="${x - 16}" cy="${y + 8}" r="3" fill="${gd}"/>` : ""}</g>`;
        if (style === "chef") return `<g><path d="M${x - 15} ${y - 4} q 0 -8 10 -8 h 12 q 8 0 8 8 v 8 h -30 z" fill="#fff" stroke="#c9d3df"/><rect x="${x - 15}" y="${y + 4}" width="30" height="5" rx="2" fill="${v >= 3 ? a : "#90a4ae"}"/>${v === 5 ? sparkle(x + 10, y - 8, 4, "#fff7b0") : ""}</g>`;
        return `<g><path d="M${x - 14} ${y - 4} q 0 -8 10 -8 h 10 q 10 0 14 -10 q 8 8 -2 24 h -32 z" fill="${S.main[v - 1]}"/><rect x="${x - 14}" y="${y + 6}" width="32" height="4" rx="2" fill="${a}"/>${star(x + 12, y - 16, 4, a)}</g>`;
      };
      return `<g>${shoe(c.cx - dx)}${shoe(c.cx + dx)}</g>`;
    }
    case 5: {
      const y = A.neckY, w = A.bodyW * 0.5;
      if (style === "magicien") return { behind: `<path d="M${cx - w - 6} ${y - 8} Q${cx - w - 30} ${A.gr - 30} ${cx - w - 16} ${A.gr + 4} L${cx + w + 16} ${A.gr + 4} Q${cx + w + 30} ${A.gr - 30} ${cx + w + 6} ${y - 8}Z" fill="${v >= 3 ? "#3a2280" : m}"/><path d="M${cx - w - 10} ${A.gr - 4} L${cx + w + 10} ${A.gr - 4}" stroke="${trim}" stroke-width="4"/>${v >= 2 ? star(cx - w - 8, A.gr - 40, 4, a) + star(cx + w + 6, A.gr - 60, 4, a) : ""}<path d="M${cx - w - 6} ${y - 8} Q${cx - w - 30} ${A.gr - 30} ${cx - w - 16} ${A.gr + 4} L${cx - w + 8} ${A.gr + 4} Q${cx - w - 12} ${A.gr - 30} ${cx - w + 2} ${y - 8}Z" fill="#c62828" opacity=".6"/>` };
      if (style === "cowboy") return `<g><path d="M${cx - w * 0.7} ${y - 2} Q${cx} ${y + 16} ${cx + w * 0.7} ${y - 2} L${cx + 8} ${y + 34} Q${cx} ${y + 44} ${cx - 8} ${y + 34}Z" fill="${v === 1 ? "#c0392b" : v === 5 ? gd : v === 4 ? "#e0a52a" : v === 3 ? "#b5651d" : "#d9534f"}"/>${[-12, 0, 12].map((d) => `<circle cx="${cx + d}" cy="${y + 12 + Math.abs(d) * -0.1}" r="2" fill="#fff" opacity=".8"/>`).join("")}${sp(cx + w * 0.7, y, 4)}</g>`;
      return `<g><path d="M${cx - w * 0.75} ${y - 3} Q${cx} ${y + 13} ${cx + w * 0.75} ${y - 3} L${cx + w * 0.75} ${y + 7} Q${cx} ${y + 23} ${cx - w * 0.75} ${y + 7}Z" fill="#fff" stroke="#dfe6ee"/><path d="M${cx + w * 0.45} ${y + 10} l 6 26 h 12 l -2 -26z" fill="#fff" stroke="#dfe6ee"/><rect x="${cx + w * 0.45}" y="${y + 30}" width="16" height="4" fill="${v >= 3 ? a : "#90a4ae"}"/>${sp(cx - w * 0.7, y, 4)}</g>`;
    }
    case 6: {
      const x = cx - A.bodyW * 0.5 - 6, y = A.waistY - 4;
      const bd = style === "cowboy" ? `<rect x="${x - 15}" y="${y}" width="30" height="26" rx="5" fill="${v === 5 ? gd : "#8b5a2b"}"/><path d="M${x - 15} ${y + 8} h 30" stroke="#4a2c12" stroke-width="3"/><circle cx="${x}" cy="${y + 12}" r="3" fill="${v >= 3 ? gd : "#d9b26f"}"/>`
        : style === "chef" ? `<path d="M${x - 16} ${y + 6} h 32 l -4 20 h -24z" fill="#d9a85c" stroke="#a97c34"/><path d="M${x - 10} ${y + 6} q 10 -18 20 0" fill="none" stroke="#a97c34" stroke-width="3"/><path d="M${x - 8} ${y + 10} l -4 14 M${x} ${y + 10} v 14 M${x + 8} ${y + 10} l 4 14" stroke="#c99347" stroke-width="2"/>`
          : `<path d="M${x - 14} ${y + 10} q 0 -6 14 -6 q 14 0 14 6 l -4 16 h -20z" fill="${m}"/><path d="M${x - 14} ${y + 10} q 14 -4 28 0" stroke="${gd}" stroke-width="3" fill="none"/>${star(x, y + 18, 5, a)}`;
      return `<g><path d="M${cx + A.bodyW * 0.3} ${A.neckY - 6} L${x + 6} ${y}" stroke="${style === "cowboy" ? "#5c3b1a" : style === "chef" ? "#a97c34" : gd}" stroke-width="4" clip-path="url(#clip)"/>${bd}${sp(x + 14, y, 4)}</g>`;
    }
    case 7: {
      const g = ([x, y]: [number, number], dir: number) => {
        if (style === "cowboy") return `<g><circle cx="${x}" cy="${y}" r="11" fill="${v === 5 ? gd : "#7a4a22"}"/><rect x="${x - 12 * -dir - 8}" y="${y - 3}" width="16" height="7" rx="3" fill="${v >= 3 ? gd : "#4a2c12"}" transform="rotate(${dir * 25} ${x} ${y})"/></g>`;
        if (style === "chef") return `<g><circle cx="${x}" cy="${y}" r="12" fill="${v >= 4 ? "#c62828" : "#f5f5f5"}" stroke="#d5dde8"/><path d="M${x - 8} ${y - 4} h 16 M${x - 8} ${y + 2} h 16" stroke="${a}" stroke-width="2" opacity=".7"/></g>`;
        return `<g><circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="#d8d0f0"/><rect x="${x - 9}" y="${y + 6}" width="18" height="6" rx="3" fill="${gd}"/>${v >= 4 ? star(x, y - 2, 4, gd) : ""}</g>`;
      };
      return `<g>${g(A.hL, -1)}${g(A.hR, 1)}</g>`;
    }
    case 8: {
      const x = cx + A.bodyW * 0.3, y = A.chest[1] - 8, R = 9 + v;
      if (style === "cowboy") return `<g>${star(x, y, R + 4, v === 5 ? gd : "#d9b26f")}${star(x, y, R, gd)}<circle cx="${x}" cy="${y}" r="2.4" fill="#fff3b0"/></g>`;
      if (style === "chef") return `<g><circle cx="${x}" cy="${y}" r="${R}" fill="#fff" stroke="${v === 5 ? gd : a}" stroke-width="3"/><path d="M${x - 5} ${y + 4} v -4 q -4 -6 3 -7 q 2 -4 4 0 q 7 1 3 7 v 4z" fill="#dfe6ee"/></g>`;
      return `<g><circle cx="${x}" cy="${y}" r="${R}" fill="${m}" stroke="${gd}" stroke-width="3"/><path d="M${x + 1} ${y - 6} a 6 6 0 1 0 5 8 a 5 5 0 1 1 -5 -8z" fill="${a}"/></g>`;
    }
    default: {
      const [x, y] = A.hR;
      if (style === "cowboy") {
        const rope = v === 5 ? gd : "#c9a45c";
        return `<g><ellipse cx="${x + 12}" cy="${y + 6}" rx="${v === 1 ? 10 : 18}" ry="${v === 1 ? 8 : 14}" fill="none" stroke="${rope}" stroke-width="4"/>${v > 1 ? `<ellipse cx="${x + 12}" cy="${y + 6}" rx="${v === 1 ? 6 : 12}" ry="${v === 1 ? 4 : 8}" fill="none" stroke="${rope}" stroke-width="2" opacity=".6"/>` : ""}${v >= 3 ? star(x + 28, y - 14, 6, gd) : ""}${sp(x + 30, y + 16, 5)}<circle cx="${x}" cy="${y}" r="6" fill="#7a4a22"/></g>`;
      }
      if (style === "chef") {
        const wpn = ['<rect x="-3" y="-30" width="6" height="34" rx="3" fill="#b9814a"/><ellipse cx="0" cy="-34" rx="9" ry="7" fill="#c99358"/>', '<rect x="-2" y="-14" width="4" height="20" rx="2" fill="#90a4ae"/><path d="M-8 -14 q 8 -22 16 0 M-4 -14 q 4 -20 8 0" fill="none" stroke="#b8c4d2" stroke-width="2"/>', '<rect x="-2" y="-16" width="4" height="22" rx="2" fill="#90a4ae"/><ellipse cx="0" cy="-22" rx="10" ry="8" fill="#b8c4d2" stroke="#8fa0b3" stroke-width="2"/>', '<circle cx="0" cy="-22" r="15" fill="#3a3f4b"/><circle cx="0" cy="-22" r="10" fill="#4a5060"/><rect x="10" y="-25" width="26" height="6" rx="3" fill="#3a3f4b"/>', '<rect x="-16" y="-30" width="32" height="24" rx="8" fill="#e8b923"/><rect x="-18" y="-34" width="36" height="8" rx="4" fill="#f5d55c"/><circle cx="0" cy="-38" r="4" fill="#e8b923"/>'][v - 1];
        return `<g transform="translate(${x + 8} ${y + 4}) rotate(14)">${wpn}${v === 5 ? sparkle(14, -36, 5, "#fff7b0") + sparkle(-16, -20, 4, "#fff7b0") : ""}</g>`;
      }
      const tip = v === 1 ? "" : v === 2 ? star(0, -44, 8, a) : v === 3 ? star(0, -44, 8, a) + sparkle(-12, -52, 5, "#fff") + sparkle(12, -34, 4, "#fff") : `<circle cx="0" cy="-46" r="${v === 5 ? 11 : 9}" fill="${v === 5 ? "#ffe27a" : "#8fd0ff"}"/><circle cx="-3" cy="-49" r="3" fill="#fff" opacity=".8"/>`;
      return `<g transform="translate(${x + 8} ${y + 2}) rotate(16)"><rect x="-3" y="-40" width="6" height="52" rx="3" fill="${v >= 4 ? (v === 5 ? gd : "#5c3b1a") : "#7a4a22"}"/>${tip}${v === 5 ? sparkle(16, -56, 5, "#fff7b0") + sparkle(-16, -40, 4, "#fff7b0") : ""}</g>`;
    }
  }
}

/* ---------------- assembling one full character ---------------- */
export type Outfit = Record<number, { style: StyleKey; v: number }>;
export type CharacterOpts = { stage: number; outfit?: Outfit; aura?: boolean; auraColor?: string; hue?: number; size?: number; noScale?: boolean };

/** Deterministic id suffix (same input → same output on server and client, so SSR hydration never mismatches). */
function hashUid(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return "c" + (h >>> 0).toString(36);
}

export function characterSVG(charKey: CharKey, opts: CharacterOpts): string {
  const c = CH[charKey];
  const st = opts.stage ?? 0;
  const A = c.A, uid = hashUid(charKey + "|" + st + "|" + JSON.stringify(opts.outfit || {}) + "|" + (opts.size || 0) + "|" + (opts.aura ? 1 : 0)), tone = c.tones[st];
  const outfit = opts.outfit || {};
  const k = opts.noScale ? 1 : SCALE[st];
  const gr = A.gr;
  const layers: string[] = [];
  let behind = "";
  for (let cat = 0; cat < 10; cat++) {
    const it = outfit[cat];
    if (!it) { layers[cat] = ""; continue; }
    const r = acc(cat, it.style, it.v, c);
    if (r && typeof r === "object") { behind += r.behind; layers[cat] = ""; } else layers[cat] = r as string;
  }
  const aura = st === 5
    ? `<g class="aura"><circle cx="100" cy="130" r="118" fill="url(#gl${uid})"/><g class="rays" style="transform-origin:100px 130px">${Array.from({ length: 12 }, (_, i) => `<path d="M100 130 L${100 - 8} 6 L${100 + 8} 6Z" fill="#ffe27a" opacity=".35" transform="rotate(${i * 30} 100 130)"/>`).join("")}</g></g>`
    : "";
  const fullAura = opts.aura ? `<g class="aura2"><circle cx="100" cy="130" r="112" fill="none" stroke="${opts.auraColor || "#ffe27a"}" stroke-width="5" opacity=".7" stroke-dasharray="10 8"/><circle cx="100" cy="130" r="100" fill="url(#fa${uid})"/></g>` : "";
  const sparkles = st >= 4 ? sparkle(30, 70, 7, "#fff7b0") + sparkle(172, 96, 6, "#fff") + sparkle(160, 40, 5, "#fff7b0") + (st === 5 ? sparkle(40, 180, 6, "#fff7b0") : "") : "";
  const gloss = st >= 3 ? `<ellipse cx="${c.cx - A.bodyW * 0.26}" cy="${A.headY + 46}" rx="9" ry="22" fill="#fff" opacity="${st >= 4 ? 0.5 : 0.35}" transform="rotate(18 ${c.cx - A.bodyW * 0.26} ${A.headY + 46})"/>` : "";
  const hue = opts.hue ? ` style="filter:hue-rotate(${opts.hue}deg)"` : "";
  const size = opts.size || 160;
  return `<svg class="linker-char" viewBox="-10 -56 220 296" width="${size}" height="${size * 1.345}" role="img" aria-label="${c.n} — ${STAGES[st].title}"${hue}>
    <defs><clipPath id="clip${uid}"><path d="${c.body}"/></clipPath>
      <radialGradient id="gl${uid}"><stop offset="0" stop-color="#fff7b0" stop-opacity=".9"/><stop offset=".6" stop-color="#ffd76b" stop-opacity=".35"/><stop offset="1" stop-color="#ffd76b" stop-opacity="0"/></radialGradient>
      <radialGradient id="fa${uid}"><stop offset=".55" stop-color="${opts.auraColor || "#ffe27a"}" stop-opacity="0"/><stop offset="1" stop-color="${opts.auraColor || "#ffe27a"}" stop-opacity=".45"/></radialGradient></defs>
    ${aura}${fullAura}
    <ellipse cx="100" cy="${gr + 4}" rx="${60 * k}" ry="7" fill="#000" opacity=".12"/>
    <g transform="translate(100 ${gr}) scale(${k}) translate(-100 -${gr})">
      ${behind}
      <ellipse cx="${A.hL[0] + 6}" cy="${A.hL[1]}" rx="9" ry="13" fill="${tone}" stroke="${c.dark}" stroke-opacity=".4" stroke-width="2" transform="rotate(30 ${A.hL[0] + 6} ${A.hL[1]})"/>
      <ellipse cx="${A.hR[0] - 6}" cy="${A.hR[1]}" rx="9" ry="13" fill="${tone}" stroke="${c.dark}" stroke-opacity=".4" stroke-width="2" transform="rotate(-30 ${A.hR[0] - 6} ${A.hR[1]})"/>
      <ellipse cx="${c.cx - A.feetDX}" cy="${A.feetY + 1}" rx="13" ry="7" fill="${c.dark}"/><ellipse cx="${c.cx + A.feetDX}" cy="${A.feetY + 1}" rx="13" ry="7" fill="${c.dark}"/>
      <path d="${c.body}" fill="${tone}" stroke="${c.dark}" stroke-opacity=".35" stroke-width="2.5"/>
      ${c.deco(st)}${gloss}
      <g clip-path="url(#clip${uid})">${(layers[2] || "").replace("url(#clip)", "url(#clip" + uid + ")")}${(layers[3] || "").replace("url(#clip)", "url(#clip" + uid + ")")}</g>
      ${layers[4] || ""}${layers[5] || ""}${(layers[6] || "").replace("url(#clip)", "url(#clip" + uid + ")")}${layers[8] || ""}
      ${face(c, st)}${layers[1] || ""}${layers[0] || ""}${layers[7] || ""}${layers[9] || ""}
    </g>${sparkles}</svg>`;
}
export { CATS };
