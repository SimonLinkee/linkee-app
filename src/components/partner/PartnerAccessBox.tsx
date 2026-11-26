"use client";

import { useEffect, useState } from "react";

// Dans la fiche d'un partenaire (équipe) : les comptes qui lui sont rattachés et leur mot de passe « NomLinkee2027 ».
// Le Superadmin et le Responsable d'antenne le voient et peuvent le réappliquer ; le partenaire ne le change pas lui-même.
type Account = { id: string; email: string; name: string; partner: string; password: string };

export default function PartnerAccessBox({ partnerId }: { partnerId: string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch(`/api/admin/partner-access?partnerId=${partnerId}`)
      .then(async (r) => {
        if (off) return;
        if (r.status === 403) return setDenied(true);
        const j = await r.json().catch(() => ({}));
        setAccounts(r.ok ? (j.accounts as Account[]) : []);
        if (!r.ok) setMsg(j.error ?? "Lecture impossible.");
      })
      .catch(() => !off && setMsg("Lecture impossible."));
    return () => {
      off = true;
    };
  }, [partnerId]);

  if (denied) return null;

  async function apply() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/partner-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partnerId }) }).catch(() => null);
    setBusy(false);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return setMsg(j.error ?? "Application impossible.");
    setMsg(j.failed?.length ? `Échec pour : ${j.failed.join(", ")}` : `Mot de passe appliqué à ${j.done.length} compte${j.done.length > 1 ? "s" : ""}.`);
  }
  async function copy(a: Account) {
    const text = `Adresse : ${a.email}\nMot de passe : ${a.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(a.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copie ces identifiants :", text);
    }
  }

  return (
    <div className="mb-3 rounded-[14px] border-[1.5px] border-[var(--border)] bg-[var(--card)] p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-[var(--navy)]">Accès à l&apos;espace partenaire</span>
        <span className="text-[11.5px] text-[var(--slate)]">Mot de passe : nom du partenaire + Linkee2027. Le partenaire ne le modifie pas, c&apos;est l&apos;équipe qui le gère.</span>
      </div>
      {accounts === null && !msg && <p className="text-[12px] text-[var(--slate)]">Chargement…</p>}
      {accounts && accounts.length === 0 && <p className="text-[12px] text-[var(--slate)]">Aucun compte n&apos;est rattaché à ce partenaire (le Superadmin le crée dans « Villes et comptes »).</p>}
      {accounts && accounts.length > 0 && (
        <>
          <div className="flex flex-col gap-1.5">
            {accounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-[var(--input-bg)] px-3 py-2 text-[12.5px]">
                <span className="min-w-[180px] flex-1 font-semibold text-[var(--navy)]">{a.email}</span>
                <code className="rounded-md bg-[var(--card)] px-2 py-0.5 text-[12px] text-[var(--navy)]">{a.password}</code>
                <button type="button" onClick={() => void copy(a)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3 py-1 text-[11.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)]">
                  {copied === a.id ? "Copié ✔" : "Copier"}
                </button>
              </div>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={() => void apply()} className="mt-2 rounded-[40px] bg-[var(--navy-deep)] px-4 py-1.5 text-[12px] font-bold text-[var(--panel-fg)] disabled:opacity-60">
            {busy ? "Application…" : "Appliquer ce mot de passe au compte"}
          </button>
        </>
      )}
      {msg && <p className="mt-1.5 text-[12px] text-[var(--slate)]">{msg}</p>}
    </div>
  );
}
