"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CharSvg from "@/components/linker/CharSvg";
import { useLinker } from "@/components/linker/LinkerContext";
import { CATS, characterSVG } from "@/lib/linker/characters";
import { STYLE_KEYS, STYLE_META, computeOutfit, itemName, versionOf, type StyleKey } from "@/lib/linker/gamification";

/** Shown right after a delivery: the newly unlocked accessory, style choice, then on to the evolution screen if this level is a milestone (10/20/30/40/50). */
export default function RecompensePage() {
  const router = useRouter();
  const { ready, linker, reload, patchLinker } = useLinker();
  const [pick, setPick] = useState<StyleKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  const level = linker.level;
  const catIndex = (level - 1) % 10;
  const cat = CATS[catIndex];
  const v = versionOf(level);
  const milestone = level % 10 === 0;

  function preview(style: StyleKey) {
    const outfit = computeOutfit(level - 1, linker!.chosen, linker!.equipped, "cowboy");
    outfit[catIndex] = { style, v, lvl: level };
    return characterSVG(linker!.character, { stage: Math.floor((level - 1) / 10), outfit, size: 100 });
  }

  async function equip() {
    if (!pick) return;
    setBusy(true);
    await patchLinker({ chosen: { ...linker!.chosen, [level]: pick } });
    setBusy(false);
    router.push(milestone ? "/linker/evolution" : "/linker/accueil");
  }

  return (
    <div className="flex flex-col items-center gap-4 pt-4 pb-4 text-center">
      <div>
        <div className="font-display text-[40px] leading-none font-black" style={{ color: "#eb6834" }}>Level {level} !</div>
        <p className="mt-1 text-[13px] font-bold text-[var(--slate)]">Link livré · +30 🪙 · +{linker.kg_saved} kg sauvés au total</p>
      </div>

      <div className="flex w-full items-center justify-center overflow-hidden rounded-[24px] py-6" style={{ background: "linear-gradient(180deg,#fff3c4,#ffe0b0)" }}>
        <CharSvg html={characterSVG(linker.character, { stage: Math.floor(level / 10), outfit: computeOutfit(level, linker.chosen, linker.equipped, "cowboy"), size: 150 })} />
      </div>

      <div className="w-full rounded-[18px] bg-[var(--warn-bg)] p-3.5 text-left">
        <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#7a5200] uppercase">🎁 Nouvel accessoire débloqué</div>
        <div className="font-display text-[19px] font-extrabold text-[var(--navy)]">{cat.e} {cat.n} — version {v}/5</div>
        {milestone && <div className="mt-0.5 text-[12px] font-bold" style={{ color: "#eb6834" }}>✨ Level palier : ta silhouette évolue juste après !</div>}
        <p className="mt-1 text-[12px] font-semibold text-[var(--slate)]">Choisis le style de ton nouvel accessoire :</p>
      </div>

      <div className="grid w-full grid-cols-3 gap-2.5">
        {STYLE_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => setPick(k)} className="rounded-[16px] border-2 p-2 text-center" style={{ borderColor: pick === k ? "var(--good)" : "var(--border)", background: pick === k ? "var(--good-bg)" : "var(--card)" }}>
            <CharSvg html={preview(k)} />
            <div className="font-display text-[13px] font-extrabold text-[var(--navy)]">{STYLE_META[k].e} {STYLE_META[k].n.split(" ")[0]}</div>
            <div className="text-[10px] font-semibold text-[var(--slate)]">{itemName(k, catIndex, v)}</div>
          </button>
        ))}
      </div>

      <button type="button" disabled={!pick || busy} onClick={equip} className="flex min-h-[52px] w-full items-center justify-center rounded-[40px] bg-[var(--navy-deep)] font-display text-[16px] font-bold text-[var(--panel-fg)] disabled:opacity-45">
        {pick ? "Équiper et continuer" : "Choisis un style"}
      </button>
    </div>
  );
}
