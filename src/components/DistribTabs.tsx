"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Blue = distributions, orange = village associatif, green = steering
const TABS = [
  { href: "/distributions", label: "Distributions", color: "#2a78d6", fg: "#ffffff", icon: <><path d="M5 9 H19 L17.5 19 H6.5 Z" /><path d="M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" /></> },
  { href: "/distributions/village", label: "Village associatif", color: "#eb6834", fg: "#ffffff", icon: <><circle cx="8" cy="8" r="2.6" /><circle cx="17" cy="9" r="2.2" /><path d="M3 19 C3.4 15.5 5.4 13.6 8 13.6 C10.6 13.6 12.6 15.5 13 19" /><path d="M14.2 14.2 C15.2 13.5 16.1 13.4 17 13.4 C19 13.4 20.4 15 20.8 18.5" /></> },
  { href: "/distributions/pilotage", label: "Pilotage et évolution", color: "#1a8f68", fg: "#ffffff", icon: <><path d="M4 19 V5" /><path d="M4 19 H20" /><path d="M7 15 L11 10 L14 13 L19 7" /></> },
];

/** Switch between the distributions list, the village associatif and the steering dashboard. */
export default function DistribTabs() {
  const path = usePathname();
  return (
    <div className="mb-[18px] inline-flex flex-wrap gap-1.5 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-1.5">
      {TABS.map((t) => {
        const on = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold ${on ? "" : "text-[var(--navy)] hover:bg-[var(--input-bg)]"}`}
            style={on ? { background: t.color, color: t.fg } : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" style={on ? undefined : { color: t.color }}>
              {t.icon}
            </svg>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
