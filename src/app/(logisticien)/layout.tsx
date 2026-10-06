import PresenceBar from "@/components/PresenceBar";

export default function LogisticienLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[460px] px-[18px] pt-3.5 pb-24">
      <div className="mb-2 flex justify-end">
        <PresenceBar channel="team" max={4} />
      </div>
      {children}
    </div>
  );
}