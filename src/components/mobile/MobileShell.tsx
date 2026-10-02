"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CityProvider, useCity } from "@/components/admin/CityContext";
import { isSuper } from "@/lib/roles";

/** Frame of the Superadmin's mobile app: slim header (home, city), one column, no side menu. */
function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { ready, cities, city, isAll, select, canSwitch, role } = useCity();
  // the national view does not exist on mobile: pick a city
  useEffect(() => {
    if (ready && canSwitch && isAll && cities[0]) select(cities[0].id);
  }, [ready, canSwitch, isAll, cities, select]);
  const home = path === "/mobile";
  // le menu à tuiles /mobile n'existe que pour le Superadmin — le Responsable d'antenne et le Resp. Distribution
  // qui ouvrent une page sous /mobile (ex. /mobile/links) reviennent plutôt à /version, leur propre accueil mobile.
  const homeHref = isSuper(role) ? "/mobile" : "/version";
  return (
    <div className="mx-auto min-h-screen max-w-[560px] px-4 pt-3 pb-24">
      <header className="mb-4 flex items-center justify-between gap-2">
        {home ? (
          <div className="flex items-end gap-0.5">
            <span className="font-script text-[28px] text-[var(--navy)]">linkee</span>
            <svg width="32" height="12" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1">
              <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
            </svg>
          </div>
        ) : (
          <Link href={homeHref} className="flex h-11 items-center gap-1.5 rounded-full bg-[var(--navy-deep)] px-4 text-[14px] font-bold text-[var(--panel-fg)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M15 5 L8 12 L15 19" />
            </svg>
            Accueil
          </Link>
        )}
        {ready && canSwitch && cities.length > 0 && (
          <select
            value={city?.id ?? ""}
            onChange={(e) => select(e.target.value)}
            className="h-11 max-w-[200px] rounded-full border-0 px-4 text-[14px] font-bold text-white"
            style={{ background: city?.color ?? "var(--slate)" }}
            aria-label="Ville"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id} className="text-[#111]">{c.name}</option>
            ))}
          </select>
        )}
      </header>
      {/* key: switching city remounts the page so it reloads that city's data */}
      <main key={city?.id ?? "none"}>{!ready ? <p className="py-10 text-center text-[14px] text-[var(--slate)]">Chargement…</p> : children}</main>
    </div>
  );
}

export default function MobileShell({ children }: { children: ReactNode }) {
  return (
    <CityProvider>
      <Frame>{children}</Frame>
    </CityProvider>
  );
}
