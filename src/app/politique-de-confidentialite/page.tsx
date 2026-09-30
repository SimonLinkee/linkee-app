// Page publique, accessible sans connexion (voir middleware + isAllowed). Contenu à faire relire par un
// professionnel du droit avant usage définitif — ceci est un point de départ raisonnable, pas un avis juridique.
// ⚠️ Remplace l'adresse ci-dessous par la vraie adresse de contact de l'association pour les demandes RGPD.
const PRIVACY_CONTACT_EMAIL = "contact@linkee-lyon.fr";

const sectionCls = "mb-7";
const h2Cls = "mb-2 font-display text-[19px] font-extrabold text-[var(--navy)]";
const pCls = "text-[14px] leading-[1.65] text-[var(--slate)]";
const ulCls = "mt-2 flex flex-col gap-1.5 pl-5 text-[14px] leading-[1.6] text-[var(--slate)] list-disc";

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="min-h-screen bg-[var(--cream)] px-5 py-10">
      <div className="mx-auto max-w-[680px]">
        <span className="font-script text-[26px] leading-none text-[var(--navy)]">linkee</span>
        <h1 className="mt-3 font-display text-[28px] font-black text-[var(--navy)]">Politique de confidentialité</h1>
        <p className="mt-1 mb-8 text-[12.5px] font-semibold text-[var(--muted)]">Dernière mise à jour : 30 septembre 2026</p>

        <div className={sectionCls}>
          <h2 className={h2Cls}>Qui sommes-nous ?</h2>
          <p className={pCls}>
            Linkee est une association de lutte contre le gaspillage alimentaire, qui organise des collectes auprès de commerces partenaires et des distributions auprès d&apos;associations bénéficiaires,
            avec l&apos;aide de bénévoles (les « Linkers »). Cette page explique quelles données personnelles nous traitons via l&apos;application Linkee, pourquoi, et comment exercer vos droits.
          </p>
        </div>

        <div className={sectionCls}>
          <h2 className={h2Cls}>Quelles données nous collectons</h2>
          <p className={pCls}>Selon votre rôle dans l&apos;application :</p>
          <ul className={ulCls}>
            <li><b className="text-[var(--navy)]">Bénévoles (Linkers)</b> — prénom, téléphone, ville, adresse de référence (pour calculer les distances de collecte), et un historique de vos collectes effectuées.</li>
            <li><b className="text-[var(--navy)]">Contacts de partenaires et d&apos;associations</b> — nom, téléphone, e-mail des personnes que vous désignez comme contact sur la fiche de votre structure.</li>
            <li><b className="text-[var(--navy)]">Salariés et responsables d&apos;antenne</b> — nom, e-mail, téléphone professionnel, et un suivi des journées de travail (horaires de tournée).</li>
          </ul>
          <p className={`${pCls} mt-2`}>Nous ne demandons jamais de données bancaires, de numéro de sécurité sociale ni de données de santé.</p>
        </div>

        <div className={sectionCls}>
          <h2 className={h2Cls}>Pourquoi nous les utilisons</h2>
          <ul className={ulCls}>
            <li>Organiser les collectes et distributions (planning, mise en relation bénévole ↔ association).</li>
            <li>Vous contacter si besoin (confirmer une collecte, un changement d&apos;horaire).</li>
            <li>Assurer le suivi et la sécurité de l&apos;activité (qui a fait quoi, à quelle heure).</li>
          </ul>
          <p className={`${pCls} mt-2`}>Nous n&apos;utilisons jamais vos données à des fins commerciales ou publicitaires, et nous ne les vendons ni ne les partageons avec des tiers à des fins de marketing. Nous n&apos;envoyons pas d&apos;e-mails automatiques ni de newsletters.</p>
        </div>

        <div className={sectionCls}>
          <h2 className={h2Cls}>Qui peut voir vos données</h2>
          <p className={pCls}>
            L&apos;équipe salariée et les responsables d&apos;antenne de votre ville, dans la limite de ce qui est nécessaire à leur mission. Vos données ne sont jamais visibles par les autres bénévoles,
            ni par les partenaires ou associations, en dehors de ce que vous choisissez vous-même de partager (par exemple, une association peut voir le nom du bénévole qui vient chercher une collecte).
          </p>
        </div>

        <div className={sectionCls}>
          <h2 className={h2Cls}>Combien de temps nous les gardons</h2>
          <p className={pCls}>
            Le temps de votre participation active, puis une durée raisonnable pour l&apos;historique et nos obligations de suivi associatif. Vous pouvez demander la suppression de votre compte à tout moment (voir ci-dessous).
          </p>
        </div>

        <div className={sectionCls}>
          <h2 className={h2Cls}>Où sont hébergées vos données</h2>
          <p className={pCls}>
            Vos données sont hébergées chez Supabase, un prestataire technique spécialisé, avec chiffrement en transit et au repos. Pour calculer une adresse ou vérifier un numéro d&apos;entreprise,
            l&apos;application interroge les services publics du gouvernement français (Base Adresse Nationale, Recherche d&apos;entreprises) — seule l&apos;adresse ou le numéro concerné leur est transmis, jamais votre identité complète.
          </p>
        </div>

        <div className={sectionCls}>
          <h2 className={h2Cls}>Vos droits</h2>
          <p className={pCls}>Conformément au RGPD, vous disposez à tout moment d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et d&apos;opposition sur vos données. Pour exercer l&apos;un de ces droits, écrivez-nous à :</p>
          <p className="mt-2 font-display text-[15px] font-bold text-[var(--navy)]">{PRIVACY_CONTACT_EMAIL}</p>
          <p className={`${pCls} mt-2`}>Nous répondrons dans un délai raisonnable, et au plus tard sous un mois.</p>
        </div>

        <a href="/linker" className="mt-4 inline-block text-[13px] font-bold text-[var(--turquoise)]">← Retour</a>
      </div>
    </div>
  );
}
