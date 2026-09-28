"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL } from "@/lib/roles";

/** Shown right after sign-in to the Responsable d'antenne and the Resp. Distribution: full PC version or quick mobile entry. */
export default function VersionPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("full_name,email,role").eq("id", auth.user.id).maybeSingle();
      setName(((data?.full_name || data?.email?.split("@")[0] || "") as string).split(" ")[0]);
      setRole(data?.role ?? "");
    })();
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="mb-2 flex items-end gap-0.5">
        <span className="font-script text-[34px] text-[var(--navy)]">linkee</span>
        <svg width="40" height="14" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1.5">
          <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="font-display text-[30px] leading-tight font-black text-[var(--navy)]">Bonjour{name ? ` ${name}` : ""}</h1>
      <p className="mt-1 mb-7 text-center text-[14px] text-[var(--slate)]">{ROLE_LABEL[role] ? `${ROLE_LABEL[role]} · ` : ""}Quelle version veux-tu utiliser ?</p>

      <div className="grid w-full max-w-[640px] grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/distributions" className="flex flex-col items-start gap-3 rounded-[22px] border-2 border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)] transition-transform hover:-translate-y-0.5 hover:border-[var(--navy-deep)]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--navy-deep)] text-[var(--panel-fg)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <rect x="2.5" y="4" width="19" height="13" rx="2" />
              <path d="M8 21 H16 M12 17 V21" />
            </svg>
          </span>
          <span>
            <span className="block font-display text-[24px] font-black text-[var(--navy)]">Version PC</span>
            <span className="block text-[13px] leading-[1.45] text-[var(--slate)]">L&apos;interface complète : tableau détaillé, pilotage, village associatif…</span>
          </span>
        </Link>
        <Link href="/saisie-mobile" className="flex flex-col items-start gap-3 rounded-[22px] border-2 border-[#2a78d6] bg-[var(--card)] p-6 shadow-[var(--shadow)] transition-transform hover:-translate-y-0.5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2a78d6] text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
              <path d="M10.5 18.5 H13.5" />
            </svg>
          </span>
          <span>
            <span className="block font-display text-[24px] font-black text-[var(--navy)]">Version mobile</span>
            <span className="block text-[13px] leading-[1.45] text-[var(--slate)]">Saisie rapide sur téléphone : chiffres, kilos, photos, associations.</span>
          </span>
        </Link>
      </div>

      <button type="button" onClick={logout} className="mt-8 text-[13px] font-semibold text-[var(--slate)] underline">Se déconnecter</button>
    </div>
  );
}
