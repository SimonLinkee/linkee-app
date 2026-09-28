"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Switch between the distributions list and the steering dashboard. */
export default function DistribTabs() {
  const path = usePathname();
  const tabs = [
    { href: "/distributions", label: "Distributions", icon: <><path d="M5 9 H19 L17.5 19 H6.5 Z" /><path d="M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" /></> },
    { href: "/distributions/pilotage", label: "Pilotage et évolution", icon: <><path d="M4 19 V5" /><path d="M4 19 H20" /><path d="M7 15 L11 10 L14 13 L19 7" /></> },
  ];
  return (
    <div className="mb-[18px] inline-flex gap-1.5 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-1.5">
      {tabs.map((t) => {
        const on = path === t.href;
        return (
          <Link key={t.href} href={t.href} className={`flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold ${on ? "bg-[#2a78d6] text-white" : "text-[var(--navy)] hover:bg-[var(--input-bg)]"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              {t.icon}
            </svg>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
