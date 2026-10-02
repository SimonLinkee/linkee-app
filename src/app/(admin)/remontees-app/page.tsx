"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL } from "@/lib/roles";
import {
  REMONTEE_COLOR,
  REMONTEE_SOFT,
  REMONTEE_STATUS_LABEL,
  REMONTEE_STATUS_STYLE,
  REMONTEE_TYPES,
  REMONTEE_TYPE_LABEL,
  describeUserAgent,
  fmtBytes,
  openRemonteeFile,
  type RemonteeMessage,
  type RemonteeRow,
  type RemonteeStatus,
  type RemonteeType,
} from "@/lib/remontees";

type Rel<T> = T | T[] | null;
type Row = RemonteeRow & { profiles: Rel<{ full_name: string | null; email: string | null }>; cities: Rel<{ name: string }> };
const SELECT = "*,profiles(full_name,email),cities(name)";

const first = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const emoji = (t: RemonteeType) => REMONTEE_TYPES.find((x) => x.k === t)?.emoji ?? "";

type StatusFilter = "all" | "unseen" | RemonteeStatus;
const FILTERS: [StatusFilter, string][] = [
  ["all", "Toutes"],
  ["unseen", "Non ouvertes"],
  ["en_attente", "En attente de traitement"],
  ["en_cours", "En cours"],
  ["traite", "Traité"],
];
const STATUS_ORDER: Record<RemonteeStatus, number> = { en_attente: 0, en_cours: 1, traite: 2 };
const selectCls = "rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[#B23B72]";

function Counter({ label, value, onClick, active }: { label: string; value: number; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border bg-[var(--card)] px-[18px] py-3.5 text-left shadow-[var(--shadow)]" style={{ borderColor: active ? REMONTEE_COLOR : "var(--border)" }}>
      <span className="mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{label}</span>
      <span className="font-display text-[26px] font-black tabular-nums">{value}</span>
    </button>
  );
}

/** « Remontées APP » (Superadmin uniquement) : toutes les remontées des utilisateurs — filtres, statut, réponse en
 * commentaire visible par le demandeur, pièces jointes. Ouvrir une remontée la marque comme vue. */
export default function RemonteesAppPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RemonteeMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchRows = () => supabase.from("remontees").select(SELECT).order("created_at", { ascending: false }).limit(2000);
  function apply({ data, error }: Awaited<ReturnType<typeof fetchRows>>) {
    if (error) setMsg({ ok: false, text: "Chargement impossible : " + error.message });
    else setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }
  useEffect(() => {
    fetchRows().then(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = (s: RemonteeStatus) => rows.filter((r) => r.status === s).length;
  const unseen = rows.filter((r) => !r.super_seen_at).length;
  const roles = useMemo(() => Array.from(new Set(rows.map((r) => r.author_role))).sort(), [rows]);
  const cities = useMemo(() => Array.from(new Map(rows.filter((r) => r.city_id).map((r) => [r.city_id as string, first(r.cities)?.name ?? "Antenne"])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [rows]);

  const visible = rows
    .filter((r) => (status === "all" ? true : status === "unseen" ? !r.super_seen_at : r.status === status))
    .filter((r) => !type || r.type === type)
    .filter((r) => !role || r.author_role === role)
    .filter((r) => !city || r.city_id === city)
    .sort((a, b) => {
      if (!a.super_seen_at !== !b.super_seen_at) return a.super_seen_at ? 1 : -1; // non ouvertes / à relire d'abord
      if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return b.created_at.localeCompare(a.created_at);
    });

  const patchRow = (id: string, p: Partial<RemonteeRow>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const fail = (e: unknown) => setMsg({ ok: false, text: (e as Error).message });
  const loadMessages = (id: string) =>
    supabase.from("remontee_messages").select("id,author_id,author_is_admin,body,created_at").eq("remontee_id", id).order("created_at").then(({ data }) => setMessages((data ?? []) as RemonteeMessage[]));

  async function toggle(r: Row) {
    if (openId === r.id) return setOpenId(null);
    setOpenId(r.id);
    setReply("");
    setMessages([]);
    loadMessages(r.id);
    if (!r.super_seen_at) {
      const { error } = await supabase.rpc("mark_remontee_seen", { p_id: r.id });
      if (!error) patchRow(r.id, { super_seen_at: new Date().toISOString() });
    }
  }

  async function changeStatus(r: Row, next: RemonteeStatus) {
    if (r.status === next) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("set_remontee_status", { p_id: r.id, p_status: next });
    setBusy(false);
    if (error) return fail(error);
    const row = data as RemonteeRow;
    patchRow(r.id, { status: row.status, treated_at: row.treated_at, super_seen_at: row.super_seen_at, updated_at: row.updated_at });
    setMsg({ ok: true, text: `Statut : ${REMONTEE_STATUS_LABEL[next]}. L'auteur est prévenu.` });
  }

  async function sendReply(r: Row) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("post_remontee_message", { p_remontee: r.id, p_body: reply });
    setBusy(false);
    if (error) return fail(error);
    setReply("");
    patchRow(r.id, { super_seen_at: r.super_seen_at ?? new Date().toISOString() });
    loadMessages(r.id);
    setMsg({ ok: true, text: "Réponse envoyée : l'auteur la voit dans son onglet Remontées." });
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-[32px] leading-none font-black" style={{ color: REMONTEE_COLOR }}>Remontées APP</h1>
        <p className="mt-1 text-[13.5px] text-[var(--slate)]">Bugs, questions et suggestions envoyés par tous les utilisateurs. Réponds en commentaire : l&apos;auteur est prévenu et voit ta réponse dans son onglet « Remontées ».</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Counter label="Non ouvertes" value={unseen} onClick={() => setStatus("unseen")} active={status === "unseen"} />
        <Counter label="En attente" value={count("en_attente")} onClick={() => setStatus("en_attente")} active={status === "en_attente"} />
        <Counter label="En cours" value={count("en_cours")} onClick={() => setStatus("en_cours")} active={status === "en_cours"} />
        <Counter label="Traité" value={count("traite")} onClick={() => setStatus("traite")} active={status === "traite"} />
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className="rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap"
              style={{ borderColor: status === k ? REMONTEE_COLOR : "var(--border)", background: status === k ? REMONTEE_COLOR : "var(--card)", color: status === k ? "#fff" : "var(--slate)" }}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les types</option>
          {REMONTEE_TYPES.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
        </select>
        <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Tous les rôles</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
        </select>
        <select className={selectCls} value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Toutes les antennes</option>
          {cities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {msg && <div className={`mb-3.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold ${msg.ok ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--critical-bg)] text-[var(--critical)]"}`}>{msg.text}</div>}

      {loading ? (
        <p className="py-8 text-center text-[13px] text-[var(--slate)]">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[13px] text-[var(--slate)]">Aucune remontée pour ces filtres.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((r) => {
            const st = REMONTEE_STATUS_STYLE[r.status];
            const open = openId === r.id;
            const author = first(r.profiles);
            const files = r.attachments ?? [];
            return (
              <div key={r.id} className="overflow-hidden rounded-2xl border bg-[var(--card)] shadow-[var(--shadow)]" style={{ borderColor: open ? REMONTEE_COLOR : "var(--border)" }}>
                <button type="button" onClick={() => toggle(r)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
                  <span className="mt-0.5 text-[20px]">{emoji(r.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-[var(--navy)]">{r.title}</span>
                      {!r.super_seen_at && <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: REMONTEE_COLOR }} title="Non ouverte ou nouvelle réponse" />}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--slate)]">
                      {author?.full_name || author?.email || "Utilisateur"} · {ROLE_LABEL[r.author_role] ?? r.author_role}
                      {first(r.cities)?.name ? ` · ${first(r.cities)!.name}` : ""} · {fmtDate(r.created_at)}
                      {files.length > 0 ? ` · 📎 ${files.length}` : ""}
                    </span>
                  </span>
                  <span className="flex-none rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{REMONTEE_STATUS_LABEL[r.status]}</span>
                </button>

                {open && (
                  <div className="border-t border-[var(--border)] px-4 py-4">
                    <div className="mb-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] text-[var(--slate)] sm:grid-cols-2">
                      <span><strong className="text-[var(--navy)]">Type :</strong> {REMONTEE_TYPE_LABEL[r.type]}</span>
                      <span><strong className="text-[var(--navy)]">Auteur :</strong> {author?.full_name || "—"}{author?.email ? ` (${author.email})` : ""}</span>
                      <span><strong className="text-[var(--navy)]">Page d&apos;origine :</strong> {r.page_path || "—"}</span>
                      <span><strong className="text-[var(--navy)]">Appareil :</strong> {describeUserAgent(r.user_agent)}</span>
                    </div>

                    <p className="rounded-[14px] border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3 text-[13.5px] leading-[1.55] whitespace-pre-wrap text-[var(--navy)]">{r.description}</p>

                    {files.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {files.map((a) => (
                          <button key={a.path} type="button" onClick={() => openRemonteeFile(supabase, a.path).catch(fail)} className="max-w-[260px] truncate rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11.5px] font-semibold text-[var(--navy)] hover:border-[#B23B72]">
                            📎 {a.name} <span className="font-normal text-[var(--slate)]">({fmtBytes(a.size)})</span>
                          </button>
                        ))}
                      </div>
                    ) : r.attachments_purged_at ? (
                      <p className="mt-2 text-[11px] text-[var(--muted)]">Pièces jointes supprimées automatiquement le {fmtDate(r.attachments_purged_at)}.</p>
                    ) : null}

                    <div className="mt-3 flex flex-col gap-2">
                      {messages.map((m) => (
                        <div key={m.id} className={`rounded-[14px] px-4 py-2.5 ${m.author_is_admin ? "" : "border border-[var(--border)] bg-[var(--input-bg)]"}`} style={m.author_is_admin ? { background: REMONTEE_SOFT, border: `1.5px solid ${REMONTEE_COLOR}` } : undefined}>
                          <div className="mb-0.5 text-[11px] font-bold" style={{ color: m.author_is_admin ? REMONTEE_COLOR : "var(--slate)" }}>{m.author_is_admin ? "Toi (Superadmin)" : author?.full_name || "Utilisateur"} · {fmtDateTime(m.created_at)}</div>
                          <p className="text-[13.5px] leading-[1.55] whitespace-pre-wrap text-[var(--navy)]">{m.body}</p>
                        </div>
                      ))}
                    </div>

                    <textarea
                      rows={3}
                      maxLength={5000}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Écrire une réponse visible par le demandeur…"
                      className="mt-3 w-full rounded-[13px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[#B23B72]"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button" disabled={busy || !reply.trim()} onClick={() => sendReply(r)} className="rounded-[40px] px-5 py-2 font-display text-[13px] font-bold text-white disabled:opacity-50" style={{ background: REMONTEE_COLOR }}>
                        {busy ? "Envoi…" : "Envoyer la réponse"}
                      </button>
                      <span className="flex-1" />
                      <span className="text-[11.5px] font-semibold text-[var(--slate)]">Statut :</span>
                      {(["en_attente", "en_cours", "traite"] as RemonteeStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(r, s)}
                          className="rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[12px] font-bold disabled:opacity-60"
                          style={{ borderColor: r.status === s ? REMONTEE_STATUS_STYLE[s].fg : "var(--border)", background: r.status === s ? REMONTEE_STATUS_STYLE[s].bg : "transparent", color: r.status === s ? REMONTEE_STATUS_STYLE[s].fg : "var(--slate)" }}
                        >
                          {REMONTEE_STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                    {r.status === "traite" && <p className="mt-2 text-[11px] text-[var(--muted)]">Les pièces jointes seront supprimées automatiquement 6 mois après le passage en « Traité » (repasser en « En cours » annule ce délai).</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
