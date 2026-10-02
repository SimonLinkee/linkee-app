"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import RemonteesPanel from "@/components/RemonteesPanel";
import { homeForRole } from "@/lib/roles";
import { REMONTEE_COLOR } from "@/lib/remontees";

// Rôles qui ont le menu latéral : la page s'affiche dans ce menu ; les autres (logisticien, partenaire, association,
// mobile) ont une page simple avec un bouton de retour vers leur espace.
const SIDEBAR_ROLES = ["admin_principal", "comptabilite", "admin_local", "resp_distribution"];
const FORMAL_ROLES = ["partenaire", "beneficiaire"];

export default function RemonteesRoute() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return setRole("");
      const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      setRole(p?.role ?? "");
    });
  }, [supabase]);

  if (role === null) return <div className="flex min-h-screen items-center justify-center text-[13px] text-[var(--slate)]">Chargement…</div>;

  const body: ReactNode = (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="mb-4 font-display text-[32px] leading-none font-black" style={{ color: REMONTEE_COLOR }}>Remontées</h1>
      <RemonteesPanel formal={FORMAL_ROLES.includes(role)} />
    </div>
  );

  if (SIDEBAR_ROLES.includes(role)) return <AdminShell>{body}</AdminShell>;

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 bg-[var(--navy-deep)] px-5 py-3 text-[var(--panel-fg)]">
        <span className="font-script text-[22px] leading-none">linkee</span>
        <span className="flex-1" />
        <Link href={homeForRole(role)} className="rounded-[40px] bg-white/12 px-4 py-1.5 text-[12.5px] font-bold">← Retour à mon espace</Link>
      </header>
      <main className="px-4 pt-5 pb-16 sm:px-6">{body}</main>
    </div>
  );
}
