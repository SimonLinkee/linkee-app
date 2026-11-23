"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";

// Envoyer une notification (cloche de l'appli) à une personne précise ou à toute une ville.
// Réservé au Superadmin (n'importe quelle ville) et au Responsable d'antenne (sa ville) — contrôlé aussi côté base (migration 079).

type Audience = "user" | "logisticiens" | "equipe" | "linkers";
type Person = { id: string; name: string; role: string };
type Sent = { key: string; title: string; body: string; at: string; total: number; read: number; names: string[] };

const AUDIENCES: { k: Audience; label: string; hint: string }[] = [
  { k: "user", label: "Une personne", hint: "Un compte précis de la ville." },
  { k: "logisticiens", label: "Tous les logisticiens", hint: "Les logisticiens de la ville." },
  { k: "equipe", label: "Toute l'équipe", hint: "Logisticiens, responsables d'antenne, resp. distribution de la ville et le Superadmin." },
  { k: "linkers", label: "Tous les Linkers", hint: "Les bénévoles Linkers de la ville." },
];
const ROLE_LABEL: Record<string, string> = { logisticien: "Logisticien", admin_local: "Resp. d'antenne", resp_distribution: "Resp. distribution", comptabilite: "Comptabilité", admin_principal: "Superadmin", linker: "Linker" };
const SUGGESTIONS = ["Rappel : pense à prendre des photos à chaque collecte.", "Changement de dernière minute : regarde ton planning.", "Réunion d'équipe demain, merci de confirmer ta présence."];
const fieldCls = "w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1.5 block text-[11.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";

export default function NotifierPage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city } = useCity();
  const [role, setRole] = useState<string | null>(null);
  const [meId, setMeId] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [audience, setAudience] = useState<Audience>("logisticiens");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setMeId(auth.user.id);
    const [p, pe, mine] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
      supabase.from("profiles").select("id,full_name,email,role,city_id").eq("active", true).or(`city_id.eq.${cityId ?? ""},role.eq.admin_principal`).order("full_name"), // le Superadmin est membre de chaque ville
      supabase.from("notifications").select("user_id,title,body,created_at,read_at").eq("sent_by", auth.user.id).order("created_at", { ascending: false }).limit(300),
    ]);
    setRole((p.data?.role as string) ?? null);
    const staff = ((pe.data ?? []) as { id: string; full_name: string | null; email: string | null; role: string }[])
      .map((x) => ({ id: x.id, name: (x.full_name || x.email || "Sans nom") + (x.id === auth.user!.id ? " (moi — pour tester)" : ""), role: x.role }));
    setPeople(staff);
    // envois regroupés : même titre + même message envoyés à la même minute = un seul envoi
    const nameOf = new Map(staff.map((x) => [x.id, x.name]));
    const groups = new Map<string, Sent>();
    for (const n of (mine.data ?? []) as { user_id: string; title: string; body: string | null; created_at: string; read_at: string | null }[]) {
      const key = `${n.title}|${n.body}|${n.created_at.slice(0, 16)}`;
      const g = groups.get(key) ?? { key, title: n.title, body: n.body ?? "", at: n.created_at, total: 0, read: 0, names: [] };
      g.total++;
      if (n.read_at) g.read++;
      const nm = nameOf.get(n.user_id);
      if (nm && g.names.length < 4) g.names.push(nm);
      groups.set(key, g);
    }
    setSent(Array.from(groups.values()).slice(0, 12));
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  const allowed = role === "admin_principal" || role === "admin_local";
  const audienceCount = audience === "logisticiens" ? people.filter((p) => p.role === "logisticien").length : audience === "equipe" ? people.filter((p) => p.id !== meId && ["logisticien", "admin_local", "resp_distribution", "admin_principal"].includes(p.role)).length : audience === "user" ? (userId ? 1 : 0) : null;

  const [diag, setDiag] = useState<{ lines: string[]; ok: boolean } | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  async function testPhone() {
    setDiagBusy(true);
    setDiag(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const j = (await res.json()) as {
        error?: string;
        subs: number;
        env?: { publicKey: boolean; privateKey: boolean; subject: string; subjectValid: boolean; webhookSecret: boolean; serviceRole: boolean; keysMatch: boolean | null };
        results: { phone: string; ok: boolean; status?: number; detail?: string }[];
      };
      const lines: string[] = [];
      if (!j.env) lines.push(j.error ?? "Erreur inconnue.");
      else {
        const e = j.env;
        if (!e.publicKey) lines.push("Il manque NEXT_PUBLIC_VAPID_PUBLIC_KEY dans Vercel (puis Redeploy).");
        if (!e.privateKey) lines.push("Il manque VAPID_PRIVATE_KEY dans Vercel.");
        if (e.publicKey && e.privateKey && e.keysMatch === false) lines.push("La clé publique et la clé privée ne vont pas ensemble : elles doivent venir de la MÊME exécution de la commande generate-vapid-keys. Remets les deux dans Vercel, fais un Redeploy, puis réactive les notifications sur le téléphone.");
        if (!e.subjectValid) lines.push(`VAPID_SUBJECT n'est pas valide (« ${e.subject} ») : il doit ressembler à mailto:ton-adresse@exemple.fr, sans espace.`);
        if (!e.webhookSecret) lines.push("Il manque PUSH_WEBHOOK_SECRET dans Vercel : sans lui, les envois automatiques sont refusés.");
        if (!e.serviceRole) lines.push("SUPABASE_SERVICE_ROLE_KEY est absente de Vercel.");
        if (j.error) lines.push(j.error);
        if (j.subs === 0) lines.push("Aucun téléphone n'est abonné à ton compte : ouvre la cloche sur le téléphone et touche Activer.");
        for (const r of j.results) {
          const hint = r.status === 403 || r.status === 401 ? " — clés ou adresse de contact invalides." : r.status === 410 || r.status === 404 ? " — abonnement périmé : réactive les notifications sur le téléphone." : "";
          lines.push(r.ok ? `${r.phone} : envoyé (code ${r.status}). La bannière doit arriver sur le téléphone.` : `${r.phone} : refusé (code ${r.status ?? "?"}) ${r.detail ?? ""}${hint}`);
        }
      }
      setDiag({ lines, ok: !!j.results?.length && j.results.every((r) => r.ok) });
    } catch (e) {
      setDiag({ lines: ["Test impossible : " + (e as Error).message], ok: false });
    }
    setDiagBusy(false);
  }

  async function send() {
    setMsg(null);
    if (!cityId) return setMsg({ ok: false, text: "Aucune ville sélectionnée." });
    if (!title.trim()) return setMsg({ ok: false, text: "Écris un titre." });
    if (audience === "user" && !userId) return setMsg({ ok: false, text: "Choisis la personne à notifier." });
    setBusy(true);
    const { data, error } = await supabase.rpc("send_notification", { p_city: cityId, p_audience: audience, p_user: audience === "user" ? userId : null, p_title: title.trim(), p_body: body.trim() });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message + (/function|schema cache/i.test(error.message) ? " (la migration 079 est-elle passée ?)" : "") });
    setMsg({ ok: true, text: `Notification envoyée à ${data} personne${Number(data) > 1 ? "s" : ""}.` });
    setTitle("");
    setBody("");
    void load();
  }

  if (role && !allowed) {
    return <p className="rounded-xl bg-[var(--warn-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--warn)]">Cette page est réservée au Superadmin et au Responsable d&apos;antenne.</p>;
  }

  return (
    <div className="max-w-[860px]">
      <div className="mb-[18px]">
        <h1 className="font-display text-[32px] leading-none font-black">Notifier</h1>
        <p className="text-[13.5px] text-[var(--slate)]">Envoie un message dans la cloche de l&apos;appli{city ? ` — ville : ${city.name}` : ""}. Le destinataire le voit tout de suite, avec ton nom.</p>
      </div>

      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <label className={labelCls}>Destinataires</label>
        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {AUDIENCES.map((a) => (
            <button key={a.k} type="button" onClick={() => setAudience(a.k)} className={`rounded-xl border-2 px-3.5 py-2.5 text-left ${audience === a.k ? "border-[var(--navy-deep)] bg-[var(--input-bg)]" : "border-[var(--border)] hover:border-[var(--turquoise)]"}`}>
              <span className="block text-[13.5px] font-bold text-[var(--navy)]">{a.label}</span>
              <span className="block text-[11.5px] text-[var(--slate)]">{a.hint}</span>
            </button>
          ))}
        </div>

        {audience === "user" && (
          <div className="mb-4">
            <label className={labelCls}>Personne</label>
            <select className={fieldCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choisir…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {ROLE_LABEL[p.role] ?? p.role}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-3.5">
          <label className={labelCls}>Titre</label>
          <input className={fieldCls} maxLength={90} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Changement de planning demain" />
        </div>
        <div className="mb-2">
          <label className={labelCls}>Message (facultatif)</label>
          <textarea className={`${fieldCls} min-h-[96px] resize-y`} maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Précise ce qu'il faut faire, pour quand…" />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setBody(s)} className="rounded-[40px] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)]">
                {s.length > 46 ? s.slice(0, 44) + "…" : s}
              </button>
            ))}
            <span className="ml-auto text-[11.5px] text-[var(--muted)]">{body.length} / 600</span>
          </div>
        </div>

        {msg && <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold ${msg.ok ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--critical-bg)] text-[var(--critical)]"}`}>{msg.text}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || !allowed} onClick={() => void send()} className="rounded-[40px] bg-[var(--navy-deep)] px-6 py-3 font-display text-[14px] font-bold text-[var(--panel-fg)] disabled:opacity-60">
            {busy ? "Envoi…" : "Envoyer la notification"}
          </button>
          <span className="text-[12px] text-[var(--slate)]">
            {audienceCount != null ? `${audienceCount} destinataire${audienceCount > 1 ? "s" : ""}` : "Linkers de la ville"}
            {audience !== "user" && audienceCount === 0 ? " — personne dans cette ville" : ""}
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <h2 className="font-display text-[16px] font-extrabold text-[var(--navy)]">Tester les notifications sur mon téléphone</h2>
        <p className="mt-0.5 mb-3 text-[12.5px] text-[var(--slate)]">Envoie une bannière de test à ton téléphone (verrouille-le avant de cliquer) et indique précisément ce qui coince si elle n&apos;arrive pas.</p>
        <button type="button" disabled={diagBusy} onClick={() => void testPhone()} className="rounded-[40px] border-[1.5px] border-[var(--navy-deep)] px-5 py-2.5 font-display text-[13.5px] font-bold text-[var(--navy-deep)] disabled:opacity-60">
          {diagBusy ? "Test en cours…" : "Envoyer une bannière de test"}
        </button>
        {diag && (
          <ul className={`mt-3 flex flex-col gap-1.5 rounded-xl px-3.5 py-3 text-[12.5px] font-semibold ${diag.ok ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"}`}>
            {diag.lines.length === 0 ? <li>Aucun problème détecté.</li> : diag.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>

      <h2 className="mt-8 mb-2.5 font-display text-[18px] font-extrabold text-[var(--navy)]">Mes derniers envois</h2>
      {sent.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-[var(--slate)]">Aucune notification envoyée pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sent.map((s) => (
            <div key={s.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-bold text-[var(--navy)]">{s.title}</span>
                <span className="rounded-[40px] bg-[var(--track)] px-2 py-0.5 text-[11px] font-bold text-[var(--slate)]">
                  {s.total} personne{s.total > 1 ? "s" : ""} · {s.read} lue{s.read > 1 ? "s" : ""}
                </span>
                <span className="ml-auto text-[11.5px] text-[var(--muted)]">{new Date(s.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {s.body && <p className="mt-1 text-[12.5px] leading-[1.4] whitespace-pre-line text-[var(--slate)]">{s.body}</p>}
              {s.names.length > 0 && <p className="mt-1 text-[11.5px] text-[var(--muted)]">À : {s.names.join(", ")}{s.total > s.names.length ? "…" : ""}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
