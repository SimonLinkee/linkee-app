"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  REMONTEE_COLOR,
  REMONTEE_SOFT,
  REMONTEE_STATUS_LABEL,
  REMONTEE_STATUS_STYLE,
  REMONTEE_TYPES,
  REMONTEE_TYPE_LABEL,
  fmtBytes,
  openRemonteeFile,
  previousPath,
  uploadRemonteeFile,
  type RemonteeAttachment,
  type RemonteeMessage,
  type RemonteeRow,
  type RemonteeType,
} from "@/lib/remontees";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const typeEmoji = (t: RemonteeType) => REMONTEE_TYPES.find((x) => x.k === t)?.emoji ?? "";

const card = "rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]";
const field = "w-full rounded-[12px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--remontee)]";
const magentaBtn = "rounded-[40px] px-5 py-2.5 font-display text-[13.5px] font-bold text-white disabled:opacity-50";

type View = { kind: "list" } | { kind: "form" } | { kind: "thread"; id: string };

/** Onglet « Remontées » côté utilisateur : explication, nouvelle remontée (bug / question / suggestion, pièces
 * jointes), liste de SES remontées avec statut, et fil de discussion avec l'équipe Linkee.
 * `formal` : vouvoiement (espaces partenaire et association) ; sinon tutoiement. */
export default function RemonteesPanel({ formal = false }: { formal?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const t = (tu: string, vous: string) => (formal ? vous : tu);
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<RemonteeRow[]>([]);
  const [unreadKeys, setUnreadKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: "list" });
  const [introOpen, setIntroOpen] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

  const fetchAll = (id: string) =>
    Promise.all([
      supabase.from("remontees").select("*").eq("author_id", id).order("created_at", { ascending: false }),
      supabase.from("notifications").select("key").eq("type", "remontee").is("read_at", null),
    ]);
  function apply([r, n]: Awaited<ReturnType<typeof fetchAll>>) {
    setItems((r.data ?? []) as unknown as RemonteeRow[]);
    setUnreadKeys(new Set((n.data ?? []).map((x) => x.key as string)));
    setLoading(false);
  }
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUid(id);
      if (!id) return setLoading(false);
      fetchAll(id).then((res) => {
        apply(res);
        if ((res[0].data ?? []).length > 0) setIntroOpen(false);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    if (uid) apply(await fetchAll(uid));
  }

  // page d'où part la remontée : la page courante si l'onglet est intégré à une page, sinon la page précédente
  const originPath = () => (pathname === "/remontees" || pathname.endsWith("/remontees") ? previousPath() : pathname);

  const current = view.kind === "thread" ? items.find((i) => i.id === view.id) : undefined;

  return (
    <div style={{ ["--remontee" as string]: REMONTEE_COLOR }}>
      <div className="mb-4 rounded-[18px] border-[1.5px] px-5 py-4" style={{ borderColor: REMONTEE_COLOR, background: REMONTEE_SOFT }}>
        <button type="button" onClick={() => setIntroOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
          <span className="font-display text-[16px] font-extrabold" style={{ color: REMONTEE_COLOR }}>À quoi sert cet onglet ?</span>
          <span className="text-[12px] font-bold" style={{ color: REMONTEE_COLOR }}>{introOpen ? "Masquer" : "Afficher"}</span>
        </button>
        {introOpen && (
          <div className="mt-2 text-[12.5px] leading-[1.6] text-[var(--navy)]">
            <p>
              {t("Un bug, une question sur l'appli, une idée pour l'améliorer ? Dis-le-nous ici, directement.", "Un bug, une question sur l'appli, une idée pour l'améliorer ? Dites-le-nous ici, directement.")}
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li><strong>{t("Choisis le type", "Choisissez le type")}</strong> : 🐞 Bug (quelque chose ne marche pas), ❓ Question (comment ça marche ?) ou 💡 Suggestion (une idée).</li>
              <li>{t("Donne un titre, explique ce qui se passe et ajoute une capture d'écran ou une photo si tu peux", "Donnez un titre, expliquez ce qui se passe et ajoutez une capture d'écran ou une photo si possible")} (5 fichiers maximum, images ou PDF, 5 Mo chacun).</li>
              <li>{t("L'équipe Linkee te répond ici même", "L'équipe Linkee vous répond ici même")} : {t("une pastille rose apparaît sur l'onglet", "une pastille rose apparaît sur l'onglet")} {t("à chaque réponse ou changement d'état. Tu peux répondre pour donner des précisions.", "à chaque réponse ou changement d'état. Vous pouvez répondre pour donner des précisions.")}</li>
            </ol>
            <p className="mt-2">
              <strong>Les états :</strong> « En attente de traitement » (bien reçue) → « En cours » (prise en charge) → « Traité ».
            </p>
            <p className="mt-2 text-[var(--slate)]">
              {t("Pense à masquer les informations personnelles (noms, téléphones…) sur tes captures d'écran.", "Pensez à masquer les informations personnelles (noms, téléphones…) sur vos captures d'écran.")} Les pièces jointes sont supprimées automatiquement 6 mois après que la remontée est traitée.
            </p>
          </div>
        )}
      </div>

      {flash && <div className="mb-3 rounded-xl bg-[var(--good-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--good)]">{flash}</div>}

      {view.kind === "form" && uid && (
        <NewRemontee
          uid={uid}
          t={t}
          originPath={originPath}
          onCancel={() => setView({ kind: "list" })}
          onDone={async () => {
            setView({ kind: "list" });
            setFlash(t("Remontée envoyée, merci ! Tu seras prévenu·e dès qu'on te répond.", "Remontée envoyée, merci ! Vous serez prévenu·e dès qu'on vous répond."));
            window.setTimeout(() => setFlash(null), 6000);
            await reload();
          }}
        />
      )}

      {view.kind === "thread" && current && uid && (
        <Thread
          item={current}
          uid={uid}
          t={t}
          onBack={() => {
            setView({ kind: "list" });
            reload();
          }}
          onChanged={reload}
        />
      )}

      {view.kind === "list" && (
        <>
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <h3 className="font-display text-[17px] font-black text-[var(--navy)]">{t("Mes remontées", "Mes remontées")}</h3>
            <button type="button" onClick={() => setView({ kind: "form" })} className={magentaBtn} style={{ background: REMONTEE_COLOR }}>+ Nouvelle remontée</button>
          </div>
          {loading ? (
            <p className="py-6 text-center text-[13px] text-[var(--slate)]">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[13px] text-[var(--slate)]">
              {t("Tu n'as encore rien envoyé.", "Vous n'avez encore rien envoyé.")}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {items.map((it) => {
                const st = REMONTEE_STATUS_STYLE[it.status];
                const unread = unreadKeys.has("remontee:" + it.id);
                return (
                  <button key={it.id} type="button" onClick={() => setView({ kind: "thread", id: it.id })} className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 text-left shadow-[var(--shadow)]">
                    <span className="mt-0.5 text-[20px]">{typeEmoji(it.type)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-bold text-[var(--navy)]">{it.title}</span>
                        {unread && <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: REMONTEE_COLOR }} title="Nouvelle réponse" />}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-[var(--slate)]">{REMONTEE_TYPE_LABEL[it.type]} · {fmtDate(it.created_at)}</span>
                    </span>
                    <span className="flex-none rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{REMONTEE_STATUS_LABEL[it.status]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NewRemontee({ uid, t, originPath, onCancel, onDone }: { uid: string; t: (tu: string, vous: string) => string; originPath: () => string; onCancel: () => void; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [type, setType] = useState<RemonteeType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const filePick = useRef<HTMLInputElement>(null);
  const photoPick = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setErr(`${MAX_ATTACHMENTS} pièces jointes maximum.`);
        break;
      }
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (!f.type.startsWith("image/") && !isPdf) {
        setErr(`${f.name} : seuls les images et les PDF sont acceptés.`);
        continue;
      }
      if (isPdf && f.size > MAX_ATTACHMENT_BYTES) {
        setErr(`${f.name} : fichier trop lourd (5 Mo maximum).`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    const id = crypto.randomUUID();
    const uploaded: RemonteeAttachment[] = [];
    try {
      for (const f of files) uploaded.push(await uploadRemonteeFile(supabase, uid, id, f));
      const { error } = await supabase.rpc("create_remontee", {
        p_id: id,
        p_type: type,
        p_title: title,
        p_description: description,
        p_page_path: originPath(),
        p_user_agent: navigator.userAgent,
        p_attachments: uploaded,
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      if (uploaded.length) await supabase.storage.from("remontees").remove(uploaded.map((a) => a.path));
      setBusy(false);
      return setErr((e as Error).message);
    }
    setBusy(false);
    onDone();
  }

  const ready = title.trim().length >= 3 && description.trim().length > 0 && !busy;
  return (
    <div className={card}>
      <h3 className="mb-3 font-display text-[17px] font-black text-[var(--navy)]">Nouvelle remontée</h3>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {REMONTEE_TYPES.map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => setType(x.k)}
            className="rounded-[14px] border-[1.5px] px-3.5 py-3 text-left"
            style={{ borderColor: type === x.k ? REMONTEE_COLOR : "var(--border)", background: type === x.k ? REMONTEE_SOFT : "var(--input-bg)" }}
          >
            <span className="block text-[14px] font-bold text-[var(--navy)]">{x.emoji} {x.l}</span>
            <span className="mt-0.5 block text-[11.5px] leading-[1.4] text-[var(--slate)]">{x.hint}</span>
          </button>
        ))}
      </div>

      <label className="mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Titre *</label>
      <input className={field} maxLength={150} placeholder="En une phrase" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="mt-3.5 mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Description *</label>
      <textarea
        className={field}
        rows={5}
        maxLength={5000}
        placeholder={type === "bug" ? t("Que faisais-tu ? Que s'est-il passé ? Que devait-il se passer ?", "Que faisiez-vous ? Que s'est-il passé ? Que devait-il se passer ?") : t("Explique avec tes mots…", "Expliquez avec vos mots…")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="mt-3.5 mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Pièces jointes (facultatif)</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => filePick.current?.click()} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-bold text-[var(--navy)]">📎 Joindre un fichier</button>
        <button type="button" onClick={() => photoPick.current?.click()} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-bold text-[var(--navy)]">📷 Prendre une photo</button>
        <input ref={filePick} type="file" multiple hidden accept="image/*,application/pdf,.pdf" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={photoPick} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--muted)]">Images ou PDF, 5 fichiers maximum, 5 Mo chacun. Les images sont réduites automatiquement.</p>
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-[11px] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate font-semibold text-[var(--navy)]">{f.name}</span>
              <span className="flex-none text-[11px] text-[var(--slate)]">{fmtBytes(f.size)}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="flex h-6 w-6 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)]" aria-label="Retirer">×</button>
            </div>
          ))}
        </div>
      )}

      {err && <div className="mt-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{err}</div>}

      <div className="mt-4 flex gap-2.5">
        <button type="button" disabled={!ready} onClick={submit} className={magentaBtn} style={{ background: REMONTEE_COLOR }}>{busy ? "Envoi…" : "Envoyer"}</button>
        <button type="button" disabled={busy} onClick={onCancel} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-5 py-2.5 font-display text-[13.5px] font-bold text-[var(--slate)]">Annuler</button>
      </div>
    </div>
  );
}

function Thread({ item, uid, t, onBack, onChanged }: { item: RemonteeRow; uid: string; t: (tu: string, vous: string) => string; onBack: () => void; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<RemonteeMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const st = REMONTEE_STATUS_STYLE[item.status];

  const fetchMessages = () => supabase.from("remontee_messages").select("id,author_id,author_is_admin,body,created_at").eq("remontee_id", item.id).order("created_at");
  useEffect(() => {
    fetchMessages().then(({ data }) => setMessages((data ?? []) as RemonteeMessage[]));
    // ouvrir le fil = les réponses sont lues
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("type", "remontee").eq("key", "remontee:" + item.id).is("read_at", null).then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function send() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("post_remontee_message", { p_remontee: item.id, p_body: reply });
    setBusy(false);
    if (error) return setErr(error.message);
    setReply("");
    const { data } = await fetchMessages();
    setMessages((data ?? []) as RemonteeMessage[]);
    onChanged();
  }

  const files = (item.attachments ?? []) as RemonteeAttachment[];
  return (
    <div className={card}>
      <button type="button" onClick={onBack} className="mb-3 text-[12.5px] font-bold" style={{ color: REMONTEE_COLOR }}>← Mes remontées</button>
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 flex-1 font-display text-[18px] font-black text-[var(--navy)]">{typeEmoji(item.type)} {item.title}</h3>
        <span className="flex-none rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{REMONTEE_STATUS_LABEL[item.status]}</span>
      </div>
      <p className="mt-0.5 text-[11.5px] text-[var(--slate)]">{REMONTEE_TYPE_LABEL[item.type]} · envoyée le {fmtDate(item.created_at)}</p>

      <div className="mt-3.5 rounded-[14px] border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3">
        <div className="mb-1 text-[11px] font-bold text-[var(--slate)]">{t("Toi", "Vous")} · {fmtDateTime(item.created_at)}</div>
        <p className="text-[13.5px] leading-[1.55] whitespace-pre-wrap text-[var(--navy)]">{item.description}</p>
        {files.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {files.map((a) => (
              <button key={a.path} type="button" onClick={() => openRemonteeFile(supabase, a.path).catch((e) => setErr((e as Error).message))} className="max-w-[240px] truncate rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11.5px] font-semibold text-[var(--navy)]">📎 {a.name}</button>
            ))}
          </div>
        )}
        {files.length === 0 && item.treated_at && <p className="mt-2 text-[11px] text-[var(--muted)]">Les pièces jointes ont été supprimées automatiquement.</p>}
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-[14px] px-4 py-3 ${m.author_is_admin ? "" : "border border-[var(--border)] bg-[var(--input-bg)]"}`}
            style={m.author_is_admin ? { background: REMONTEE_SOFT, border: `1.5px solid ${REMONTEE_COLOR}` } : undefined}
          >
            <div className="mb-1 text-[11px] font-bold" style={{ color: m.author_is_admin ? REMONTEE_COLOR : "var(--slate)" }}>
              {m.author_is_admin ? "Équipe Linkee" : m.author_id === uid ? t("Toi", "Vous") : "Utilisateur"} · {fmtDateTime(m.created_at)}
            </div>
            <p className="text-[13.5px] leading-[1.55] whitespace-pre-wrap text-[var(--navy)]">{m.body}</p>
          </div>
        ))}
      </div>

      {item.status === "traite" ? (
        <p className="mt-3.5 rounded-xl bg-[var(--good-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--good)]">
          {t("Cette remontée est traitée. Si besoin, fais-en une nouvelle.", "Cette remontée est traitée. Si besoin, créez-en une nouvelle.")}
        </p>
      ) : (
        <div className="mt-3.5">
          <textarea className={field} rows={3} maxLength={5000} placeholder={t("Répondre ou donner des précisions…", "Répondre ou donner des précisions…")} value={reply} onChange={(e) => setReply(e.target.value)} />
          {err && <div className="mt-2 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--critical)]">{err}</div>}
          <button type="button" disabled={busy || !reply.trim()} onClick={send} className={`${magentaBtn} mt-2`} style={{ background: REMONTEE_COLOR }}>{busy ? "Envoi…" : "Envoyer"}</button>
        </div>
      )}
    </div>
  );
}
