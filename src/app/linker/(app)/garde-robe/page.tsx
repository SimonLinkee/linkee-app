"use client";

import { useState } from "react";
import CharSvg from "@/components/linker/CharSvg";
import { useLinker } from "@/components/linker/LinkerContext";
import { CATS, characterSVG } from "@/lib/linker/characters";
import { STYLE_META, computeOutfit, fullSetStyle, itemName, versionOf, type StyleKey } from "@/lib/linker/gamification";

export default function GardeRobePage() {
  const { ready, linker, patchLinker } = useLinker();
  const [cat, setCat] = useState(0);
  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  const outfit = computeOutfit(linker.level, linker.chosen, linker.equipped, "cowboy");
  const fs = fullSetStyle(outfit);
  const unlocks: { lvl: number; style: StyleKey; v: number }[] = [];
  for (let l = 1; l <= linker.level; l++) if ((l - 1) % 10 === cat) unlocks.push({ lvl: l, style: linker.chosen[l] || "cowboy", v: versionOf(l) });
  const nextLvl = linker.level + 1;

  function equip(lvl: number) {
    patchLinker({ equipped: { ...linker!.equipped, [cat]: lvl } });
  }
  function unequip() {
    patchLinker({ equipped: { ...linker!.equipped, [cat]: "none" } });
  }

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <h1 className="font-display text-[26px] leading-none font-black text-[var(--navy)]">Ma garde-robe</h1>

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
    </div>
  );
}
