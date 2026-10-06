"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CityProvider, useCity } from "@/components/admin/CityContext";
import { Sidebar } from "@/components/admin/Sidebar";
import PresenceBar from "@/components/PresenceBar";

// Rôles qui voient la pastille « qui est connecté » : toute l'équipe de la version PC (le logisticien apparaît pour les autres sans voir le bandeau)
const PRESENCE_ROLES = ["admin_principal", "comptabilite", "admin_local", "resp_distribution", "resp_rh"];

// Pages qui ne s'ouvrent que pour une ville : en vue « Toutes les villes », on propose de choisir la ville au lieu d'une page vide.
// Le menu, lui, reste identique partout.
export const CITY_ONLY_PATHS = ["/partenaires", "/planning", "/stock", "/todo", "/distributions", "/village-associatif", "/prospection", "/links-benevoles"];

function Frame({ children }: { children: ReactNode }) {
  const { ready, isAll, city, cities, select, role } = useCity();
  const pathname = usePathname();
  const blocked = ready && isAll && CITY_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        {/* thin band in the colour of the city you are browsing */}
        <div className="h-1.5 w-full transition-colors" style={{ background: !ready ? "transparent" : isAll ? "linear-gradient(90deg,#2a78d6,#eb6834,#1baf7a,#B23B72,#7C5CD9)" : (city?.color ?? "transparent") }} />
        {ready && PRESENCE_ROLES.includes(role) && (
          <div className="flex justify-end px-[38px] pt-3">
            <PresenceBar channel="team" />
          </div>
        )}
        {/* key: switching city remounts the page so it reloads that city's data */}
        <main key={isAll ? "all" : (city?.id ?? "none")} className="px-[38px] py-8 pb-[60px]">{!ready ? null : blocked ? (
          <div className="mx-auto mt-10 max-w-[520px] rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center">
            <p className="font-display text-[20px] font-black text-[var(--navy)]">Choisis une ville</p>
            <p className="mt-1 mb-5 text-[13.5px] text-[var(--slate)]">Cette page est propre à chaque ville. Sélectionne celle que tu veux consulter.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {cities.map((c) => (
                <button key={c.id} type="button" onClick={() => select(c.id)} className="flex items-center gap-2 rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[13.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)]">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : children}</main>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <CityProvider>
      <Frame>{children}</Frame>
    </CityProvider>
  );
}
