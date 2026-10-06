import PresenceBar from "@/components/PresenceBar";

export default function LogisticienLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[460px] px-[18px] pt-3.5 pb-24">
      {/* le logisticien apparaît comme connecté pour l'équipe, mais ne voit pas le bandeau (pas de place perdue sur son téléphone) */}
      <PresenceBar channel="team" hidden />
      {children}
    </div>
  );
}