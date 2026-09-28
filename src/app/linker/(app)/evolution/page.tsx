"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CharSvg from "@/components/linker/CharSvg";
import { useLinker } from "@/components/linker/LinkerContext";
import { characterSVG } from "@/lib/linker/characters";
import { STAGES, computeOutfit, stageOf } from "@/lib/linker/gamification";

/** Pokémon-style full-screen evolution animation, shown right after crossing a stage milestone (level 10/20/30/40/50). */
export default function EvolutionPage() {
  const router = useRouter();
  const { ready, linker } = useLinker();
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 1400);
    return () => clearTimeout(t);
  }, []);

  if (!ready || !linker) return null;
  const to = stageOf(linker.level);
  const from = Math.max(0, to - 1);
  const outfit = computeOutfit(linker.level, linker.chosen, linker.equipped, "cowboy");

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6 text-center text-white" style={{ background: "radial-gradient(circle at 50% 40%,#5b3fa6,#1c1146 70%)" }}>
      <style>{`
        @keyframes lk-flash{0%,35%{opacity:0}45%,60%{opacity:1}100%{opacity:0}}
        @keyframes lk-fade{0%,40%{opacity:1;transform:scale(1)}50%,100%{opacity:0;transform:scale(.6)}}
        @keyframes lk-appear{0%,52%{opacity:0;transform:scale(.4)}75%{opacity:1;transform:scale(1.15)}100%{opacity:1;transform:scale(1)}}
      `}</style>
      <div className="pointer-events-none fixed inset-0 bg-white" style={{ animation: "lk-flash 1.6s forwards" }} />
      {!reveal && <div className="font-display text-[24px] font-black">Oh ? Ton Linker réagit…</div>}
      <div className="relative flex h-[320px] w-[280px] items-center justify-center">
        <div className="absolute" style={{ animation: "lk-fade 1.6s forwards" }}>
          <CharSvg html={characterSVG(linker.character, { stage: from, outfit, size: 220 })} />
        </div>
        <div className="absolute" style={{ animation: "lk-appear 1.6s forwards" }}>
          <CharSvg html={characterSVG(linker.character, { stage: to, outfit, size: 250 })} />
        </div>
      </div>
      {reveal && (
        <div>
          <div className="font-display text-[28px] font-black" style={{ color: "#ffcf3d" }}>Ton Linker évolue !</div>
          <div className="mt-1 text-[15px] font-bold">{STAGES[from].title} → {STAGES[to].title}</div>
          <div className="mt-3 rounded-[14px] bg-white/15 px-4 py-2 text-[13px] font-bold">🎁 Accessoire d&apos;évolution exclusif débloqué</div>
          <button type="button" onClick={() => router.replace("/linker/accueil")} className="mt-4 min-h-[50px] w-full rounded-[40px] bg-white font-display text-[16px] font-bold text-[var(--navy)]">
            Super !
          </button>
        </div>
      )}
    </div>
  );
}
