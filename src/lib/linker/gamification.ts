// Links Bénévoles — gamification constants shared by the character engine and the Linker app.
// Pure data + pure functions, no React/DOM dependency: portable as-is to a future mobile build.

export type CatKey = "chapeau" | "lunettes" | "haut" | "bas" | "chaussures" | "echarpe" | "sac" | "gants" | "badge" | "objet";
export type StyleKey = "cowboy" | "chef" | "magicien" | "pirate" | "ninja" | "astronaute" | "jardinier" | "superheros" | "robot" | "fee";
export type Mode = "walk" | "car";

export const STAGES = [
  { name: "Bébé", title: "Padawan", from: 1, to: 9 },
  { name: "Enfant", title: "Apprenti Linker", from: 10, to: 19 },
  { name: "Ado", title: "Linker", from: 20, to: 29 },
  { name: "Adulte mûr", title: "Linker confirmé", from: 30, to: 39 },
  { name: "Géant", title: "Mentor", from: 40, to: 49 },
  { name: "Légendaire", title: "Ambassadeur", from: 50, to: 50 },
] as const;
export const SCALE = [0.78, 0.86, 0.94, 1.0, 1.1, 1.18];

export const stageOf = (level: number) => (level >= 50 ? 5 : Math.floor(level / 10));
/** The version (1-5) an accessory gets, based on the level it was unlocked at. */
export const versionOf = (level: number) => Math.min(5, Math.floor(level / 10) + 1);
export const XP_PER_LINK = 100;

export const CATS: { k: CatKey; n: string; e: string }[] = [
  { k: "chapeau", n: "Chapeau", e: "🎩" },
  { k: "lunettes", n: "Lunettes", e: "🕶️" },
  { k: "haut", n: "Haut", e: "👕" },
  { k: "bas", n: "Bas", e: "👖" },
  { k: "chaussures", n: "Chaussures", e: "👟" },
  { k: "echarpe", n: "Écharpe / cape", e: "🧣" },
  { k: "sac", n: "Sac", e: "👜" },
  { k: "gants", n: "Gants", e: "🧤" },
  { k: "badge", n: "Badge", e: "🏅" },
  { k: "objet", n: "Objet en main", e: "🪄" },
];

// All 10 styles now have real accessory art (see characters.ts).
export const STYLE_KEYS: StyleKey[] = ["cowboy", "chef", "magicien", "pirate", "ninja", "astronaute", "jardinier", "superheros", "robot", "fee"];
export const STYLE_META: Record<StyleKey, { n: string; e: string; bg: string }> = {
  cowboy: { n: "Cowboy", e: "🤠", bg: "linear-gradient(180deg,#ffd9a0 0%,#f7a56b 55%,#d98a4e 100%)" },
  chef: { n: "Chef cuisinier", e: "👨‍🍳", bg: "repeating-conic-gradient(#fff8ec 0 25%,#f3e6d3 0 50%) 0 0/34px 34px" },
  magicien: { n: "Magicien", e: "🧙", bg: "radial-gradient(circle at 30% 20%,#5b3fa6 0%,#2a1a5e 60%,#150c33 100%)" },
  pirate: { n: "Pirate", e: "🏴‍☠️", bg: "linear-gradient(180deg,#8fd0e8 0%,#4a90a8 60%,#2c6478 100%)" },
  ninja: { n: "Ninja", e: "🥷", bg: "linear-gradient(180deg,#3a3a4a 0%,#1e1e2a 70%,#101018 100%)" },
  astronaute: { n: "Astronaute", e: "👩‍🚀", bg: "radial-gradient(circle at 30% 20%,#1c2a6e 0%,#0a1030 70%,#05081c 100%)" },
  jardinier: { n: "Jardinier", e: "🧑‍🌾", bg: "linear-gradient(180deg,#eaf7d8 0%,#cdeeb0 55%,#a8d97e 100%)" },
  superheros: { n: "Super-héros", e: "🦸", bg: "linear-gradient(180deg,#ffe08a 0%,#e24b4a 60%,#a3201f 100%)" },
  robot: { n: "Robot / Cyber", e: "🤖", bg: "linear-gradient(180deg,#dbe4ec 0%,#aab8c4 60%,#7c8b9c 100%)" },
  fee: { n: "Fée / Elfe", e: "🧚", bg: "radial-gradient(circle at 30% 20%,#ffe0f5 0%,#d6b8ff 60%,#a88ae0 100%)" },
};

const TIER = { m: ["classique", "renforcé", "de qualité", "d'élite", "doré"], f: ["classique", "renforcée", "de qualité", "d'élite", "dorée"] };
const NOUN: Record<StyleKey, ([string, "m" | "f"] | null)[]> = {
  cowboy: [null, ["Lunettes", "f"], ["Gilet", "m"], ["Jean", "m"], ["Bottes", "f"], ["Foulard", "m"], ["Sacoche", "f"], ["Gants", "m"], ["Étoile de shérif", "f"], ["Lasso", "m"]],
  chef: [null, ["Lunettes", "f"], ["Veste", "f"], ["Pantalon", "m"], ["Sabots", "m"], ["Torchon", "m"], ["Panier", "m"], ["Maniques", "f"], ["Pin's", "m"], ["Ustensile", "m"]],
  magicien: [null, ["Lunettes", "f"], ["Veste", "f"], ["Pantalon", "m"], ["Chaussons", "m"], ["Cape", "f"], ["Bourse", "f"], ["Gants", "m"], ["Médaillon", "m"], ["Baguette", "f"]],
  pirate: [null, ["Cache-œil", "m"], ["Gilet", "m"], ["Pantalon", "m"], ["Bottes", "f"], ["Ceinture", "f"], ["Sac au trésor", "m"], ["Gants", "m"], ["Médaillon", "m"], ["Sabre", "m"]],
  ninja: [null, ["Bandeau", "m"], ["Kimono", "m"], ["Pantalon", "m"], ["Chaussons", "m"], ["Écharpe", "f"], ["Sac à shurikens", "m"], ["Gants", "m"], ["Emblème", "m"], ["Shuriken", "m"]],
  astronaute: [null, ["Visière", "f"], ["Combinaison", "f"], ["Pantalon", "m"], ["Bottes", "f"], ["Écharpe thermique", "f"], ["Sac à air", "m"], ["Gants", "m"], ["Insigne", "m"], ["Sonde", "f"]],
  jardinier: [null, ["Lunettes", "f"], ["Tablier", "m"], ["Pantalon", "m"], ["Bottes", "f"], ["Écharpe", "f"], ["Panier", "m"], ["Gants", "m"], ["Badge", "m"], ["Arrosoir", "m"]],
  superheros: [null, ["Masque", "m"], ["Combinaison", "f"], ["Collant", "m"], ["Bottes", "f"], ["Cape", "f"], ["Sac", "m"], ["Gants", "m"], ["Blason", "m"], ["Bouclier", "m"]],
  robot: [null, ["Visière", "f"], ["Plastron", "m"], ["Jambières", "f"], ["Bottes", "f"], ["Câble", "m"], ["Sac à outils", "m"], ["Gants", "m"], ["Module", "m"], ["Télécommande", "f"]],
  fee: [null, ["Lunettes", "f"], ["Robe", "f"], ["Collant", "m"], ["Chaussons", "m"], ["Ailes", "f"], ["Bourse", "f"], ["Gants", "m"], ["Médaillon", "m"], ["Baguette", "f"]],
};
const HAT_NAMES: Record<StyleKey, string[]> = {
  cowboy: ["Bandana", "Chapeau de paille", "Stetson", "Stetson shérif", "Stetson doré"],
  chef: ["Bandana", "Toque courte", "Grande toque", "Toque étoilée", "Toque dorée 3 étoiles"],
  magicien: ["Bandeau étoilé", "Petit chapeau pointu", "Grand chapeau étoilé", "Chapeau de mage", "Chapeau astral doré"],
  pirate: ["Bandana", "Tricorne", "Tricorne à plume", "Tricorne du capitaine", "Tricorne doré"],
  ninja: ["Bandeau simple", "Bandeau à symbole", "Capuche", "Capuche du clan", "Capuche dorée"],
  astronaute: ["Bonnet thermique", "Casque simple", "Casque à visière", "Casque de mission", "Casque doré étoilé"],
  jardinier: ["Bandana", "Chapeau de paille", "Grand chapeau de paille", "Chapeau fleuri", "Chapeau doré fleuri"],
  superheros: ["Bandeau", "Masque", "Masque à ailerons", "Masque de la ligue", "Masque doré"],
  robot: ["Antenne simple", "Casque à antenne", "Casque lumineux", "Casque à visière HUD", "Casque doré"],
  fee: ["Serre-tête feuille", "Petite couronne", "Couronne fleurie", "Couronne scintillante", "Couronne dorée"],
};
const OBJ_NAMES: Record<StyleKey, string[]> = {
  cowboy: ["Corde en pelote", "Lasso", "Lasso étoilé", "Lasso de shérif", "Lasso doré"],
  chef: ["Cuillère en bois", "Fouet", "Louche", "Poêle", "Cocotte dorée"],
  magicien: ["Bâton en bois", "Baguette étoilée", "Baguette scintillante", "Sceptre de cristal", "Sceptre doré"],
  pirate: ["Longue-vue", "Sabre", "Sabre à garde", "Sabre du second", "Sabre doré du capitaine"],
  ninja: ["Shuriken en bois", "Shuriken", "Double shuriken", "Kunai", "Shuriken doré"],
  astronaute: ["Lampe torche", "Sonde", "Sonde à antenne", "Sonde scientifique", "Sonde dorée"],
  jardinier: ["Petite pelle", "Arrosoir", "Arrosoir fleuri", "Sécateur", "Arrosoir doré"],
  superheros: ["Poing levé", "Bouclier", "Bouclier à emblème", "Bouclier de la ligue", "Bouclier doré"],
  robot: ["Pince simple", "Télécommande", "Module clignotant", "Module à antenne", "Module doré"],
  fee: ["Brindille", "Baguette étoilée", "Baguette à ruban", "Baguette scintillante", "Baguette dorée"],
};
/** Display name of one accessory (category index 0-9, version 1-5) in a given style. */
export function itemName(style: StyleKey, catIndex: number, v: number): string {
  if (catIndex === 0) return HAT_NAMES[style][v - 1];
  if (catIndex === 9) return OBJ_NAMES[style][v - 1];
  const entry = NOUN[style][catIndex];
  if (!entry) return CATS[catIndex].n;
  const [noun, g] = entry;
  return `${noun} ${TIER[g][v - 1]}`;
}

export const WALK_TITLES = ["Petit marcheur", "Marcheur", "Grand marcheur", "Randonneur", "Cycliste du dimanche", "Cycliste", "Grand cycliste", "Coursier", "Pédaleur fou", "Tour de France"];
export const CAR_TITLES: [number, string][] = [[10, "Drive"], [20, "Super Driver"], [30, "Roi de la route"], [40, "Pilote de rallye"], [50, "Fou du volant"]];
/** The badge shown on a Linker's profile, derived from mode + radius. */
export function typology(mode: Mode, radiusKm: number): { t: string; e: string } {
  if (mode === "walk") { const i = Math.min(10, Math.max(1, Math.round(radiusKm))); return { t: WALK_TITLES[i - 1], e: i <= 4 ? "🚶" : "🚲" }; }
  const hit = CAR_TITLES.find(([max]) => radiusKm <= max) ?? CAR_TITLES[CAR_TITLES.length - 1];
  return { t: hit[1], e: "🚗" };
}
export const MAX_KG: Record<Mode, number> = { walk: 25, car: 80 };

/** Outfit actually worn, given every level reached and what the Linker chose to equip. `chosen` maps level -> style picked at that level; `equipped` maps category index -> the level whose item is worn ('none' to bare that slot). */
export function computeOutfit(level: number, chosen: Record<number, StyleKey>, equipped: Record<number, number | "none">, defaultStyle: StyleKey) {
  const unlocks: { lvl: number; cat: number; v: number; style: StyleKey }[] = [];
  for (let l = 1; l <= level; l++) unlocks.push({ lvl: l, cat: (l - 1) % 10, v: versionOf(l), style: chosen[l] ?? defaultStyle });
  const out: Record<number, { style: StyleKey; v: number; lvl: number }> = {};
  for (let cat = 0; cat < 10; cat++) {
    const items = unlocks.filter((u) => u.cat === cat);
    if (!items.length) continue;
    const eq = equipped[cat];
    const pick = eq === "none" ? null : (eq != null && items.find((i) => i.lvl === eq)) || items[items.length - 1];
    if (pick) out[cat] = { style: pick.style, v: pick.v, lvl: pick.lvl };
  }
  return out;
}
export function fullSetStyle(outfit: Record<number, { style: StyleKey }>): StyleKey | null {
  const vals = Object.values(outfit);
  if (vals.length !== 10) return null;
  const s = new Set(vals.map((v) => v.style));
  return s.size === 1 ? vals[0].style : null;
}
