"use client";

import { useState } from "react";
import CharSvg from "@/components/linker/CharSvg";
import { useLinker } from "@/components/linker/LinkerContext";
import { CATS, characterSVG } from "@/lib/linker/characters";
import { STYLE_META, computeOutfit, fullSetStyle, itemName, stageOf, versionOf, type StyleKey } from "@/lib/linker/gamification";

const EMOJI: [string, string, number][] = [["⭐", "Étoile", 40], ["🚀", "Fusée", 60], ["🌈", "Arc-en-ciel", 80], ["🔥", "Flamme", 80], ["🍀", "Trèfle", 50]];
const BG: [string, string, string, number][] = [
  ["prairie", "Prairie", "linear-gradient(180deg,#c8f0ff,#b8ec9a)", 90],
  ["ville", "Ville du soir", "linear-gradient(180deg,#ffb88a,#6b5bd6)", 120],
  ["bonbon", "Bonbon", "linear-gradient(135deg,#ffc2e2,#c9b8ff)", 100],
  ["nuit", "Nuit étoilée", "radial-gradient(circle at 30% 20%,#3b3a8f,#0c0c2e)", 140],
];
const HUE: [number, string, number][] = [[0, "Couleur d'origine", 0], [45, "Soleil", 60], [-40, "Bonbon", 60], [190, "Glace", 80], [110, "Menthe", 80]];

/** Garde-robe + Boutique fusionnées en une seule page à onglets (auparavant deux onglets séparés dans la barre du bas). */
export default function GardeRobePage() {
  const { ready, linker, patchLinker } = useLinker();
  const [section, setSection] = useState<"tenue" | "boutique">("tenue");
  const [cat, setCat] = useState(0);
  const [shopTab, setShopTab] = useState<"emoji" | "bg" | "color">("emoji");
  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  const outfit = computeOutfit(linker.level, linker.chosen, linker.equipped, "cowboy");
  const fs = fullSetStyle(outfit);
  const cosm = linker.cosmetics || {};
  const owned = cosm.owned || {};

  const unlocks: { lvl: number; style: StyleKey; v: number }[] = [];
  for (let l = 1; l <= linker.level; l++) if ((l - 1) % 10 === cat) unlocks.push({ lvl: l, style: linker.chosen[l] || "cowboy", v: versionOf(l) });
  const nextLvl = linker.level + 1;

  function equip(lvl: number) {
    patchLinker({ equipped: { ...linker!.equipped, [cat]: lvl } });
  }
  function unequip() {
    patchLinker({ equipped: { ...linker!.equipped, [cat]: "none" } });
  }
  async function buy(kind: "emoji" | "bg" | "color", key: string, price: number) {
    const already = !!(owned as Record<string, Record<string, boolean>>)[kind]?.[key];
    if (!already) {
      if (linker!.points < price) return;
      await patchLinker({
        points: linker!.points - price,
        cosmetics: { ...cosm, owned: { ...owned, [kind]: { ...(owned as Record<string, Record<string, boolean>>)[kind], [key]: true } } },
      });
    }
    const cur = kind === "color" ? cosm.hue === Number(key) : (cosm as Record<string, string>)[kind] === key;
    await patchLinker({ cosmetics: { ...cosm, [kind]: cur ? (kind === "color" ? 0 : "") : kind === "color" ? Number(key) : key } });
  }

  const grid =
    shopTab === "emoji"
      ? EMOJI.map(([e, n, p]) => ({ key: e, label: n, price: p, visual: <span className="text-[30px]">{e}</span>, on: cosm.emoji === e, owned: !!owned.emoji?.[e] }))
      : shopTab === "bg"
        ? BG.map(([k, n, bg, p]) => ({ key: k, label: n, price: p, visual: <span className="block h-14 w-full rounded-[12px]" style={{ background: bg }} />, on: cosm.bg === k, owned: !!owned.bg?.[k] }))
        : HUE.map(([h, n, p]) => ({ key: String(h), label: n, price: p, visual: <span className="text-[26px]" style={{ filter: `hue-rotate(${h}deg)` }}>🍓</span>, on: cosm.hue === h, owned: !!owned.color?.[String(h)] }));

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[26px] leading-none font-black text-[var(--navy)]">Mon Linker</h1>
        <span className="rounded-[40px] bg-[var(--warn-bg)] px-3.5 py-1.5 text-[14px] font-bold text-[var(--navy)]">🪙 {linker.points}</span>
      </div>

      <div className="flex gap-1.5 rounded-[40px] bg-[var(--track)] p-1">
        {([["tenue", "👔 Garde-robe"], ["boutique", "🛍️ Boutique"]] as const).map(([k, n]) => (
          <button key={k} type="button" onClick={() => setSection(k)} className={`flex-1 rounded-[40px] px-2 py-2 text-[13px] font-bold ${section === k ? "bg-[var(--card)] shadow" : "text-[var(--slate)]"}`}>{n}</button>
        ))}
      </div>

      {section === "tenue" ? (
        <>
          <div className="flex items-end justify-center overflow-hidden rounded-[24px] pt-4" style={{ height: 230, background: fs ? "linear-gradient(180deg,#fff3c4,#ffe0f0)" : "linear-gradient(180deg,#d9f3ff,#f4e9ff)" }}>
            <CharSvg html={characterSVG(linker.character, { stage: Math.floor(linker.level / 10), outfit, aura: !!fs, auraColor: fs === "magicien" ? "#c9a8ff" : "#ffd76b", size: 190 })} />
          </div>

          <div className="flex items-center gap-2.5 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-3" style={fs ? { background: "linear-gradient(120deg,#fff3c4,#ffe0f0)", borderColor: "var(--sun,#ffcf3d)" } : undefined}>
            <span className="text-[26px]">{fs ? "🌟" : "👔"}</span>
            <div>
              <div className="font-display text-[14.5px] font-extrabold text-[var(--navy)]">{fs ? `Tenue complète ${STYLE_META[fs].n} !` : "Tenue en cours"}</div>
              <div className="text-[11.5px] font-semibold text-[var(--slate)]">{fs ? "Bonus : aura + fond thématique 🎉" : `${Object.keys(outfit).length}/10 catégories équipées`}</div>
            </div>
          </div>

          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
            {CATS.map((c, i) => (
              <button key={c.k} type="button" onClick={() => setCat(i)} className="relative h-[58px] w-[52px] flex-none rounded-[16px] text-[20px]" style={{ background: cat === i ? "var(--navy-deep)" : "var(--card)", color: cat === i ? "#fff" : "var(--navy)", border: `2px solid ${cat === i ? "var(--navy-deep)" : "var(--border)"}` }}>
                {c.e}
                {outfit[i] && <span className="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-[var(--good)]" />}
                <div className="text-[8px] font-bold">{c.n.split(" ")[0]}</div>
              </button>
            ))}
          </div>

          <div className="font-display text-[17px] font-extrabold text-[var(--navy)]">{CATS[cat].e} {CATS[cat].n}</div>
          {unlocks.length === 0 && <p className="rounded-[14px] bg-[var(--card)] p-3 text-center text-[12.5px] font-semibold text-[var(--slate)]">Rien encore dans cette catégorie.</p>}
          <div className="flex flex-col gap-2">
            {unlocks.map((u) => {
              const on = outfit[cat]?.lvl === u.lvl;
              return (
                <button key={u.lvl} type="button" onClick={() => equip(u.lvl)} className="flex items-center gap-3 rounded-[16px] border-2 bg-[var(--card)] p-2.5 text-left" style={{ borderColor: on ? "var(--good)" : "var(--border)" }}>
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[13px] text-[22px]" style={{ background: STYLE_META[u.style].bg }}>{STYLE_META[u.style].e}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[14.5px] font-extrabold text-[var(--navy)]">{itemName(u.style, cat, u.v)}</span>
                    <span className="block text-[11px] font-semibold text-[var(--slate)]">{STYLE_META[u.style].n} · version {u.v}/5 · level {u.lvl}</span>
                  </span>
                  <span className="text-[11.5px] font-bold" style={{ color: on ? "var(--good)" : "var(--muted)" }}>{on ? "✓ Équipé" : "Équiper"}</span>
                </button>
              );
            })}
          </div>
          {unlocks.length > 0 && (
            <button type="button" onClick={unequip} className="min-h-[42px] rounded-[40px] border-[1.5px] border-[var(--border)] font-display text-[13.5px] font-bold text-[var(--slate)]">
              Retirer cet accessoire
            </button>
          )}

          <div className="rounded-[16px] border border-dashed border-[var(--border)] bg-[var(--input-bg)] p-3">
            <div className="text-[11.5px] font-bold text-[var(--muted)]">🔒 Prochain déblocage : level {nextLvl} → {CATS[(nextLvl - 1) % 10].e} {CATS[(nextLvl - 1) % 10].n}</div>
            <p className="mt-1.5 text-[10.5px] font-semibold text-[var(--muted)]">10 styles au choix à chaque récompense : Cowboy, Chef cuisinier, Magicien, Pirate, Ninja, Astronaute, Jardinier, Super-héros, Robot/Cyber, Fée/Elfe.</p>
          </div>
        </>
      ) : (
        <>
          <div className="relative flex items-end justify-center overflow-hidden rounded-[22px] pt-3" style={{ height: 190, background: cosm.bg ? BG.find((b) => b[0] === cosm.bg)?.[2] : "linear-gradient(180deg,#d9f3ff,#f4e9ff)" }}>
            {cosm.emoji && <span className="absolute top-2 text-[22px]">{cosm.emoji}</span>}
            <CharSvg html={characterSVG(linker.character, { stage: stageOf(linker.level), outfit, aura: !!fullSetStyle(outfit), size: 150, hue: cosm.hue })} />
          </div>

          <div className="flex gap-1.5 rounded-[40px] bg-[var(--track)] p-1">
            {([["emoji", "😀 Émoticônes"], ["bg", "🖼️ Fonds"], ["color", "🎨 Couleurs"]] as const).map(([k, n]) => (
              <button key={k} type="button" onClick={() => setShopTab(k)} className={`flex-1 rounded-[40px] px-2 py-2 text-[12.5px] font-bold ${shopTab === k ? "bg-[var(--card)] shadow" : "text-[var(--slate)]"}`}>{n}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {grid.map((g) => (
              <button key={g.key} type="button" onClick={() => buy(shopTab, g.key, g.price)} className="rounded-[16px] border-2 bg-[var(--card)] p-2.5 text-center" style={{ borderColor: g.on ? "var(--good)" : "var(--border)" }}>
                <div className="flex h-16 items-center justify-center">{g.visual}</div>
                <div className="font-display text-[13.5px] font-extrabold text-[var(--navy)]">{g.label}</div>
                <div className="text-[11.5px] font-bold" style={{ color: g.on ? "var(--good)" : g.owned ? "var(--good)" : "#eb6834" }}>{g.on ? "✓ Utilisé" : g.owned ? "Utiliser" : `🪙 ${g.price}`}</div>
              </button>
            ))}
          </div>
          <p className="text-center text-[11.5px] font-semibold text-[var(--slate)]">Les points se gagnent à chaque Link livré. Les accessoires, eux, se débloquent avec les levels — pas avec les points.</p>
        </>
      )}
    </div>
  );
}
