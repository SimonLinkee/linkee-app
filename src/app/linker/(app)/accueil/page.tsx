"use client";

import Link from "next/link";
import CharSvg from "@/components/linker/CharSvg";
import { useLinker } from "@/components/linker/LinkerContext";
import { CATS, CH, characterSVG } from "@/lib/linker/characters";
import { STAGES, computeOutfit, fullSetStyle, stageOf } from "@/lib/linker/gamification";

export default function LinkerAccueilPage() {
  const { ready, name, linker } = useLinker();
  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  const st = stageOf(linker.level);
  const outfit = computeOutfit(linker.level, linker.chosen, linker.equipped, "cowboy");
  const fs = fullSetStyle(outfit);
  const max = linker.level >= 50;
  const nextCat = CATS[linker.level % 10];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12.5px] font-bold text-[var(--slate)]">Salut {name} 👋</div>
          <h1 className="font-display text-[26px] leading-none font-black text-[var(--navy)]">{STAGES[st].title}</h1>
        </div>
      </div>

      <div className="flex items-end justify-center overflow-hidden rounded-[26px] pt-4" style={{ height: 250, background: fs ? "linear-gradient(180deg,#fff3c4,#ffe0f0)" : "linear-gradient(180deg,#d9f3ff,#f4e9ff)" }}>
        <CharSvg html={characterSVG(linker.character, { stage: st, outfit, aura: !!fs, auraColor: fs === "magicien" ? "#c9a8ff" : "#ffd76b", size: 210 })} />
      </div>

      <div className="flex items-center gap-2.5">
        <span className="rounded-[16px] bg-[var(--navy-deep)] px-3.5 py-1.5 font-display text-[20px] font-black text-[var(--panel-fg)]">Level {linker.level}</span>
        <span className="text-[13px] font-bold text-[var(--slate)]">{CH[linker.character].n} · {STAGES[st].name}</span>
      </div>

      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5">
        <div className="flex items-center justify-between text-[13px] font-bold text-[var(--navy)]">
          <span>Prochain level</span>
          <span style={{ color: "#eb6834" }}>{max ? "Niveau max" : "Livre 1 Link"}</span>
        </div>
        {!max && <p className="mt-1 text-[12px] font-semibold text-[var(--slate)]">Un Link livré = un level de plus, jusqu&apos;au level 50.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-[11px] font-bold text-[var(--slate)]">🎁 Prochaine récompense</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[var(--input-bg)] text-[22px]" style={{ filter: "grayscale(1) opacity(.5)" }}>{max ? "" : nextCat.e}</span>
            <div>
              <div className="font-display text-[14px] font-extrabold text-[var(--navy)]">{max ? "—" : nextCat.n}</div>
              <div className="text-[10.5px] font-bold text-[var(--slate)]">tu choisis le style</div>
            </div>
          </div>
        </div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-[11px] font-bold text-[var(--slate)]">✨ Prochaine évolution</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-11 w-11 flex-none overflow-hidden" style={{ filter: "grayscale(1) opacity(.4)" }}>{!max && <CharSvg html={characterSVG(linker.character, { stage: Math.min(5, st + 1), size: 44 })} />}</span>
            <div>
              <div className="font-display text-[14px] font-extrabold text-[var(--navy)]">{max ? "Légendaire" : STAGES[Math.min(5, st + 1)].title}</div>
              <div className="text-[10.5px] font-bold text-[var(--slate)]">{max ? "atteint !" : `dans ${10 - (linker.level % 10 || 10) + (linker.level % 10 === 0 ? 0 : 0)} Link(s)`}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5 text-center">
          <div className="font-display text-[26px] font-black text-[var(--good)]">{linker.kg_saved}</div>
          <div className="text-[11.5px] font-bold text-[var(--slate)]">kg sauvés 🌍</div>
        </div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5 text-center">
          <div className="font-display text-[26px] font-black text-[var(--blue,#2a78d6)]">{linker.links_done}</div>
          <div className="text-[11.5px] font-bold text-[var(--slate)]">Links livrés 📦</div>
        </div>
      </div>

      <Link href="/linker/carte" className="flex min-h-[54px] items-center justify-center rounded-[40px] bg-[var(--navy-deep)] font-display text-[16px] font-bold text-[var(--panel-fg)] shadow-[var(--shadow)]">
        🗺️ Voir les Links près de moi
      </Link>
    </div>
  );
}
