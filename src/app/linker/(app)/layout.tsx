import { LinkerProvider } from "@/components/linker/LinkerContext";
import LinkerShell from "@/components/linker/LinkerShell";

export default function LinkerAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LinkerProvider>
      <LinkerShell>{children}</LinkerShell>
    </LinkerProvider>
  );
}
