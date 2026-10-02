"use client";

import OrganigrammeView from "@/components/OrganigrammeView";

export default function OrganigrammePage() {
  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Organigramme</h1>
      <p className="mb-5 text-[13.5px] text-[var(--slate)]">Qui fait quoi, au national et dans chaque antenne.</p>
      <OrganigrammeView />
    </div>
  );
}
