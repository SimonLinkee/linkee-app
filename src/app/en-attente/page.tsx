"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EnAttentePage() {
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[380px] rounded-[28px] bg-[var(--card)] px-7 py-8 text-center shadow-[var(--shadow)]">
        <span className="font-script text-[32px] leading-none">linkee</span>
        <h1 className="mt-4 font-display text-[22px] font-black">Compte en attente</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--slate)]">
          Votre compte est bien créé, mais aucun rôle ne lui a encore été attribué. Un administrateur Linkee va
          l&apos;activer — vous pourrez ensuite vous reconnecter.
        </p>
        <button
          type="button"
          onClick={logout}
          className="mt-5 w-full rounded-[40px] bg-[var(--navy-deep)] py-3 font-display text-base font-bold text-[var(--panel-fg)]"
        >
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
