import Link from "next/link";

/** Encadré « Bêta test » des Links Bénévoles : « team » pour l'équipe et les partenaires, « linker » pour les bénévoles. */
export default function BetaNote({ audience = "team", href, className = "" }: { audience?: "team" | "linker"; href?: string; className?: string }) {
  const remontees = href ? (
    <Link href={href} className="font-extrabold underline underline-offset-2">Remontées</Link>
  ) : (
    <strong className="font-extrabold">Remontées</strong>
  );
  return (
    <div className={`rounded-[14px] bg-[var(--warn-bg)] px-3.5 py-2.5 text-[12.5px] leading-[1.5] font-semibold text-[var(--warn)] ${className}`} role="note">
      {audience === "linker" ? (
        <>
          <span className="mr-1">🧪</span>
          <strong className="font-extrabold">Tu fais partie des premiers Linkers expérimentateurs !</strong> Les Links sont en bêta test : c&apos;est encore en cours de développement, donc tout n&apos;est pas finalisé. Si quelque chose bloque ou t&apos;étonne, dis-le-nous dans l&apos;onglet {remontees} : chaque retour nous aide à améliorer l&apos;appli. Merci 🧡
        </>
      ) : (
        <>
          <strong className="font-extrabold">Bêta test</strong> · En cours de développement. Un bug, une question, une idée ? Dis-le-nous dans l&apos;onglet {remontees}.
        </>
      )}
    </div>
  );
}
