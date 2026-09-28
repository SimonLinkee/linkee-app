"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CityProvider, useCity } from "@/components/admin/CityContext";
import { Sidebar } from "@/components/admin/Sidebar";

// Screens that only make sense for one city. In the national view ("all cities") only Dashboard and Fleet stay available.
export const CITY_ONLY_PATHS = ["/partenaires", "/planning", "/stock"];

function Frame({ children }: { children: ReactNode }) {
  const { ready, isAll, city } = useCity();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = ready && isAll && CITY_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  useEffect(() => {
    if (blocked) router.replace("/dashboard");
  }, [blocked, router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        {/* thin band in the colour of the city you are browsing */}
        <div className="h-1.5 w-full transition-colors" style={{ background: !ready ? "transparent" : isAll ? "linear-gradient(90deg,#2a78d6,#eb6834,#1baf7a,#B23B72,#7C5CD9)" : (city?.color ?? "transparent") }} />
        {/* key: switching city remounts the page so it reloads that city's data */}
        <main key={isAll ? "all" : (city?.id ?? "none")} className="px-[38px] py-8 pb-[60px]">{!ready || blocked ? null : children}</main>
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
