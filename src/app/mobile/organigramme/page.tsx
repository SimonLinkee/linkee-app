"use client";

import OrganigrammeView from "@/components/OrganigrammeView";

export default function MobileOrganigrammePage() {
  return (
    <div>
      <h1 className="mb-3 font-display text-[28px] leading-none font-black text-[var(--navy)]">Organigramme</h1>
      <OrganigrammeView mobile />
    </div>
  );
}
