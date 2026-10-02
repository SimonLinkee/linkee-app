"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CharSvg from "@/components/linker/CharSvg";
import BetaBadge from "@/components/BetaBadge";
import { characterSVG } from "@/lib/linker/characters";

/** Public landing page for the Links Bénévoles programme — reachable while signed out (see middleware.ts). */
export default function LinkerIntroPage() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<"loading" | "anon" | "pending" | "member">("loading");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setState("anon");
      const { data } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (data?.role === "linker") { window.location.href = "/linker/accueil"; return; }
      setState(data?.role === "en_attente" ? "pending" : "anon");
    })();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[var(--cream)] px-5 py-8">
      <div className="mx-auto max-w-[480px]">
        <div className="mb-6 flex items-end justify-center gap-0.5">
          <span className="font-script text-[30px] leading-none text-[var(--navy)]">linkee</span>
          <svg width="34" height="12" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1">
            <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
          </svg>
        </div>

        <div className="mb-4 flex justify-center"><BetaBadge label="Bêta test" /></div>

        <h1 className="text-center font-display text-[32px] leading-[1.05] font-black text-[var(--navy)]">
          Sauve de la nourriture,
          <br />
          un <span style={{ color: "#eb6834" }}>Link</span> à la fois
        </h1>
        <p className="mx-auto mt-3 max-w-[360px] text-center text-[14px] leading-relaxed font-semibold text-[var(--slate)]">
          Un commerce a des invendus. Une association a besoin de les recevoir. Toi, en quelques minutes à pied, à vélo ou en voiture, tu fais le lien.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
          <span className="text-[34px]">🏪</span>
          <span className="h-0.5 flex-1 border-t-2 border-dotted border-[var(--turquoise)]" />
          <CharSvg html={characterSVG("carotte", { stage: 1, size: 46, outfit: { 6: { style: "cowboy", v: 1 } } })} />
          <span className="h-0.5 flex-1 border-t-2 border-dotted border-[var(--turquoise)]" />
          <span className="text-[34px]">🏠</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4 text-center shadow-[var(--shadow)]">
            <div className="text-[28px]">🎒</div>
            <div className="font-display text-[22px] font-black text-[var(--navy)]">25 kg</div>
            <div className="text-[11.5px] font-bold text-[var(--slate)]">à pied ou à vélo</div>
          </div>
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4 text-center shadow-[var(--shadow)]">
            <div className="text-[28px]">🚗</div>
            <div className="font-display text-[22px] font-black text-[var(--navy)]">80 kg</div>
            <div className="text-[11.5px] font-bold text-[var(--slate)]">en voiture</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {[
            ["🔔", "Tu reçois un Link", "Une notification quand une collecte compatible avec ton profil apparaît près de toi."],
            ["📞", "Tu appelles l'association", "Un coup de fil pour confirmer qu'elle peut recevoir la livraison."],
            ["🎒", "Tu collectes puis tu livres", "Au créneau indiqué par le commerce partenaire."],
            ["🎉", "Ton Linker gagne un level", "Il grandit et débloque un nouvel accessoire à chaque Link livré."],
          ].map(([e, t, d], i) => (
            <div key={i} className="flex items-center gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-[var(--warn-bg)] text-[22px]">{e}</span>
              <div>
                <div className="font-display text-[15px] font-extrabold text-[var(--navy)]">{i + 1}. {t}</div>
                <div className="text-[12px] leading-tight font-semibold text-[var(--slate)]">{d}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-col gap-2.5">
          {state === "pending" ? (
            <Link href="/linker/inscription" className="flex min-h-[54px] items-center justify-center rounded-[40px] bg-[var(--navy-deep)] px-4 font-display text-[17px] font-bold text-[var(--panel-fg)]">
              Continuer mon inscription
            </Link>
          ) : (
            <Link href="/linker/inscription" className="flex min-h-[54px] items-center justify-center rounded-[40px] bg-[var(--navy-deep)] px-4 font-display text-[17px] font-bold text-[var(--panel-fg)] shadow-[var(--shadow)]">
              Devenir Linker bénévole
            </Link>
          )}
          <Link href="/login" className="flex min-h-[44px] items-center justify-center rounded-[40px] border-[1.5px] border-[var(--border)] px-4 font-display text-[14px] font-bold text-[var(--navy)]">
            Déjà Linker ? Se connecter
          </Link>
        </div>

        <p className="mt-6 text-center text-[11.5px] leading-relaxed text-[var(--slate)]">
          📵 Ajoute Linkee à ton écran d&apos;accueil pour recevoir les notifications (indispensable sur iPhone). Le lien s&apos;affichera dès ta première connexion.
        </p>
        <Link href="/politique-de-confidentialite" className="mt-4 block text-center text-[11.5px] font-bold text-[var(--slate)] underline">
          Politique de confidentialité
        </Link>
      </div>
    </div>
  );
}
