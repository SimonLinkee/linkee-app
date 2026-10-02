"use client";

import RemonteesPanel from "@/components/RemonteesPanel";
import { REMONTEE_COLOR } from "@/lib/remontees";

export default function MobileRemonteesPage() {
  return (
    <div>
      <h1 className="mb-4 font-display text-[28px] leading-none font-black" style={{ color: REMONTEE_COLOR }}>Remontées</h1>
      <RemonteesPanel />
    </div>
  );
}
