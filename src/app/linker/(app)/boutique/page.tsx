"use client";

import { useState } from "react";
import CharSvg from "@/components/linker/CharSvg";
import { useLinker } from "@/components/linker/LinkerContext";
import { characterSVG } from "@/lib/linker/characters";
import { computeOutfit, fullSetStyle, stageOf } from "@/lib/linker/gamification";

const EMOJI: [string, string, number][] = [["⭐", "Étoile", 40], ["🚀", "Fusée", 60], ["🌈", "Arc-en-ciel", 80], ["🔥", "Flamme", 80], ["🍀", "Trèfle", 50]];
const BG: [string, string, string, number][] = [
  ["prairie", "Prairie", "linear-gradient(180deg,#c8f0ff,#b8ec9a)", 90],
  ["ville", "Ville du soir", "linear-gradient(180deg,#ffb88a,#6b5bd6)", 120],
  ["bonbon", "Bonbon", "linear-gradient(135deg,#ffc2e2,#c9b8ff)", 100],
  ["nuit", "Nuit étoilée", "radial-gradient(circle at 30% 20%,#3b3a8f,#0c0c2e)", 140],
];
const HUE: [number, string, number][] = [[0, "Couleur d'origine", 0], [45, "Soleil", 60], [-40, "Bonbon", 60], [190, "Glace", 80], [110, "Menthe", 80]];

export default function BoutiquePage() {
  const { ready, linker, patchLinker } = useLinker();
  const [tab, setTab] = useState<"emoji" | "bg" | "color">("emoji");
  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  const cosm = linker.cosmetics || {};
  const owned = cosm.owned || {};
  const outfit = computeOutfit(linker.level, linker.chosen, linker.equipped, "cowboy");

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
    tab === "emoji"
      ? EMOJI.map(([e, n, p]) => ({ key: e, label: n, price: p, visual: <span className="text-[30px]">{e}</span>, on: cosm.emoji === e, owned: !!owned.emoji?.[e] }))
      : tab === "bg"
        ? BG.map(([k, n, bg, p]) => ({ key: k, label: n, price: p, visual: <span className="block h-14 w-full rounded-[12px]" style={{ background: bg }} />, on: cosm.bg === k, owned: !!owned.bg?.[k] }))
        : HUE.map(([h, n, p]) => ({ key: String(h), label: n, price: p, visual: <span className="text-[26px]" style={{ filter: `hue-rotate(${h}deg)` }}>🍓</span>, on: cosm.hue === h, owned: !!owned.color?.[String(h)] }));

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[26px] leading-none font-black text-[var(--navy)]">Boutique</h1>
        <span className="rounded-[40px] bg-[var(--warn-bg)] px-3.5 py-1.5 text-[14px] font-bold text-[var(--navy)]">🪙 {linker.points}</span>
      </div>

      <div className="flex items-end justify-center overflow-hidden rounded-[22px] pt-3" style={{ height: 190, background: cosm.bg ? BG.find((b) => b[0] === cosm.bg)?.[2] : "linear-gradient(180deg,#d9f3ff,#f4e9ff)" }}>
        {cosm.emoji && <span className="absolute mt-[-150px] text-[22px]">{cosm.emoji}</span>}
        <CharSvg html={characterSVG(linker.character, { stage: stageOf(linker.level), outfit, aura: !!fullSetStyle(outfit), size: 150, hue: cosm.hue })} />
      </div>

      <div className="flex gap-1.5 rounded-[40px] bg-[var(--track)] p-1">
        {([["emoji", "😀 Émoticônes"], ["bg", "🖼️ Fonds"], ["color", "🎨 Couleurs"]] as const).map(([k, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-[40px] px-2 py-2 text-[12.5px] font-bold ${tab === k ? "bg-[var(--card)] shadow" : "text-[var(--slate)]"}`}>{n}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {grid.map((g) => (
          <button key={g.key} type="button" onClick={() => buy(tab, g.key, g.price)} className="rounded-[16px] border-2 bg-[var(--card)] p-2.5 text-center" style={{ borderColor: g.on ? "var(--good)" : "var(--border)" }}>
            <div className="flex h-16 items-center justify-center">{g.visual}</div>
            <div className="font-display text-[13.5px] font-extrabold text-[var(--navy)]">{g.label}</div>
            <div className="text-[11.5px] font-bold" style={{ color: g.on ? "var(--good)" : g.owned ? "var(--good)" : "#eb6834" }}>{g.on ? "✓ Utilisé" : g.owned ? "Utiliser" : `🪙 ${g.price}`}</div>
          </button>
        ))}
      </div>
      <p className="text-center text-[11.5px] font-semibold text-[var(--slate)]">Les points se gagnent à chaque Link livré. Les accessoires, eux, se débloquent avec les levels — pas avec les points.</p>
    </div>
  );
}
