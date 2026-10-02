/** Petite pastille « Bêta » : signale que les Links Bénévoles sont en phase de test. `onDark` pour un fond sombre ou coloré. */
export default function BetaBadge({ label = "Bêta", onDark = false, className = "" }: { label?: string; onDark?: boolean; className?: string }) {
  return (
    <span
      title="Links Bénévoles : fonctionnalité en bêta test"
      className={`inline-flex flex-none items-center rounded-full px-[7px] py-[1px] align-middle text-[9px] leading-[1.5] font-extrabold tracking-[0.06em] whitespace-nowrap uppercase ${
        onDark ? "bg-white/25 text-white" : "bg-[var(--warn-bg)] text-[var(--warn)]"
      } ${className}`}
    >
      {label}
    </span>
  );
}
