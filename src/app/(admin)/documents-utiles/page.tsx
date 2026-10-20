"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { isSuper } from "@/lib/roles";
import { safeLink } from "@/lib/calendarIcons";

// Documents utiles (migration 067) : porte-documents du Superadmin, de la Comptabilité, des Responsables d'antenne,
// Resp. Distribution et Resp. RH. Deux onglets : « Partagés par Linkee » (publiés par le Superadmin / la Comptabilité, pour toutes les
// villes ou certaines) et « Mes documents » (personnels, visibles par leur auteur seul, + ceux qu'on te transmet).
// La Resp. RH, le Superadmin et la Comptabilité peuvent aussi envoyer un document à des personnes précises.

const RUBRICS = ["Procédures et consignes", "Modèles et formulaires", "Finances et comptabilité", "Ressources humaines", "Partenaires et communication", "Juridique et assurance", "Accueil et formation", "Autres"];
const ALLOWED_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "txt", "odt", "ods", "png", "jpg", "jpeg", "webp"];
const MAX_BYTES = 20 * 1024 * 1024;
const ROLE_LABEL: Record<string, string> = { admin_principal: "Superadmin", comptabilite: "Comptabilité", admin_local: "Resp. d'antenne", resp_distribution: "Resp. Distribution", resp_rh: "Resp. RH" };

type Doc = {
  id: string;
  title: string;
  description: string;
  rubric: string;
  scope: "shared" | "private" | "people";
  city_ids: string[];
  storage_path: string | null; // null = document sous forme de lien
  link_url: string | null; // lien (Google Drive, Docs, Sheets…) à la place d'un fichier
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  owner_id: string;
  owner_name: string | null;
  created_at: string;
};
type Person = { id: string; full_name: string; role: string; city_name: string | null };
type Form = { id?: string; mode: "file" | "link"; url: string; file: File | null; title: string; description: string; rubric: string; scope: "shared" | "private" | "people"; allCities: boolean; cityIds: Set<string>; people: Set<string> };

const extOf = (n: string) => (n.split(".").pop() ?? "").toLowerCase();
const kindOf = (n: string): { cls: string; icon: string; label: string } => {
  const e = extOf(n);
  if (e === "pdf") return { cls: "bg-[var(--critical-bg)] text-[var(--critical)]", icon: "PDF", label: "PDF" };
  if (["xls", "xlsx", "csv", "ods"].includes(e)) return { cls: "bg-[var(--good-bg)] text-[var(--good)]", icon: "XLS", label: "Tableur" };
  if (["png", "jpg", "jpeg", "webp"].includes(e)) return { cls: "bg-[var(--warn-bg)] text-[var(--warn)]", icon: "IMG", label: "Image" };
  return { cls: "bg-[rgba(42,120,214,.14)] text-[#2a78d6]", icon: "DOC", label: "Document" };
};
/** Un lien : on reconnaît les documents Google pour afficher le bon libellé. */
const linkKind = (url: string): { cls: string; icon: string; label: string } => {
  let u: URL | null = null;
  try {
    u = new URL(url);
  } catch {
    /* lien invalide : libellé générique */
  }
  const h = u?.hostname ?? "";
  const p = u?.pathname ?? "";
  if (h === "docs.google.com" && p.startsWith("/spreadsheets")) return { cls: "bg-[var(--good-bg)] text-[var(--good)]", icon: "SHEET", label: "Google Sheets" };
  if (h === "docs.google.com" && p.startsWith("/document")) return { cls: "bg-[rgba(42,120,214,.14)] text-[#2a78d6]", icon: "DOC", label: "Google Docs" };
  if (h === "docs.google.com" && p.startsWith("/presentation")) return { cls: "bg-[var(--warn-bg)] text-[var(--warn)]", icon: "SLIDE", label: "Google Slides" };
  if ((h === "docs.google.com" && p.startsWith("/forms")) || h === "forms.gle") return { cls: "bg-[rgba(124,92,217,.14)] text-[#7C5CD9]", icon: "FORM", label: "Google Forms" };
  if (h.endsWith("drive.google.com")) return { cls: "bg-[var(--critical-bg)] text-[var(--critical)]", icon: "DRIVE", label: "Google Drive" };
  return { cls: "bg-[var(--track)] text-[var(--slate)]", icon: "LIEN", label: h || "Lien" };
};
const fmtSize = (b: number | null) => (b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} Ko` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1 mt-3 block text-[11.5px] font-semibold text-[var(--slate)]";
const SEEN_KEY = "linkee.seen.docs";

export default function DocumentsUtilesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, cities, ready } = useCity();
  const isPublisher = isSuper(role); // Superadmin et Comptabilité publient pour tous
  const isSender = isPublisher || role === "resp_rh"; // et la Resp. RH peut envoyer à des personnes précises
  const [meId, setMeId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [recips, setRecips] = useState<{ doc_id: string; user_id: string }[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"shared" | "mine">("shared");
  const [rub, setRub] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string>("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([
      supabase.from("useful_docs").select("id,title,description,rubric,scope,city_ids,storage_path,link_url,file_name,mime,size_bytes,owner_id,owner_name,created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("useful_doc_recipients").select("doc_id,user_id").limit(5000),
    ]);
    if (d.error) setErr("Chargement impossible : " + d.error.message + " (la migration 067 est-elle passée ?)");
    setDocs((d.data ?? []) as unknown as Doc[]);
    setRecips((r.data ?? []) as { doc_id: string; user_id: string }[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMeId(auth.user?.id ?? null);
      try {
        setSeen(window.localStorage.getItem(SEEN_KEY) ?? "");
      } catch {
        /* pas de stockage */
      }
      await load();
      if (isSender) {
        const { data } = await supabase.rpc("docs_directory");
        setPeople((data ?? []) as Person[]);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [ready, supabase, load, isSender]);

  const cityName = useMemo(() => new Map(cities.map((c) => [c.id, c.name])), [cities]);
  const personName = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people]);

  const inShared = docs.filter((d) => d.scope === "shared");
  const inMine = docs.filter((d) => d.scope !== "shared");
  const transmitted = inMine.filter((d) => d.scope === "people" && d.owner_id !== meId);
  const hasNew = transmitted.some((d) => d.created_at > seen);

  function selectTab(t: "shared" | "mine") {
    setTab(t);
    if (t === "mine") {
      const now = new Date().toISOString();
      setSeen(now);
      try {
        window.localStorage.setItem(SEEN_KEY, now);
      } catch {
        /* ignore */
      }
    }
  }

  const needle = norm(q.trim());
  const visible = (tab === "shared" ? inShared : inMine).filter((d) => (!rub || d.rubric === rub) && (!needle || norm(d.title + " " + d.description + " " + (d.file_name ?? "") + " " + (d.link_url ?? "")).includes(needle)));

  async function openDoc(d: Doc) {
    if (d.link_url) {
      const safe = safeLink(d.link_url);
      if (!safe) return setErr("Ce lien n'est pas valide.");
      window.open(safe, "_blank", "noopener,noreferrer");
      return;
    }
    if (!d.storage_path) return;
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("useful-docs").createSignedUrl(d.storage_path, 300);
    if (error || !data) {
      w?.close();
      return setErr("Ouverture impossible : " + (error?.message ?? "fichier introuvable"));
    }
    if (w) w.location.assign(data.signedUrl);
    else window.open(data.signedUrl, "_blank");
  }

  function openNew() {
    setForm({ mode: "file", url: "", file: null, title: "", description: "", rubric: RUBRICS[0], scope: "private", allCities: true, cityIds: new Set(), people: new Set() });
  }
  function openEdit(d: Doc) {
    setForm({ id: d.id, mode: d.link_url ? "link" : "file", url: d.link_url ?? "", file: null, title: d.title, description: d.description, rubric: d.rubric, scope: d.scope, allCities: d.city_ids.length === 0, cityIds: new Set(d.city_ids), people: new Set() });
  }

  async function save() {
    if (!form || !meId) return;
    const title = form.title.trim();
    const description = form.description.trim();
    if (!title || !description) return setErr("Le titre et la brève description sont obligatoires.");
    if (form.scope === "shared" && !form.allCities && form.cityIds.size === 0) return setErr("Choisis au moins une ville, ou « Toutes les villes ».");
    if (form.scope === "people" && form.people.size === 0 && !form.id) return setErr("Choisis au moins une personne destinataire.");
    setBusy(true);
    setErr(null);
    const cityIds = form.scope === "shared" && !form.allCities ? Array.from(form.cityIds) : [];
    const link = form.mode === "link" ? safeLink(form.url) : null;
    if (form.mode === "link" && !link) {
      setBusy(false);
      return setErr("Colle l'adresse complète du lien (elle commence par https://).");
    }
    if (form.id) {
      const { error } = await supabase.from("useful_docs").update({ title, description, rubric: form.rubric, city_ids: form.scope === "shared" ? cityIds : [], ...(form.mode === "link" ? { link_url: link } : {}), updated_at: new Date().toISOString() }).eq("id", form.id);
      setBusy(false);
      if (error) return setErr("Modification impossible : " + error.message);
      setForm(null);
      return load();
    }
    if (form.mode === "link") {
      const { data: prof0 } = await supabase.from("profiles").select("full_name,email").eq("id", meId).maybeSingle();
      const ownerName0 = (prof0?.full_name as string | null) || (prof0?.email as string | null)?.split("@")[0] || "Équipe Linkee";
      const insL = await supabase.from("useful_docs").insert({ title, description, rubric: form.rubric, scope: form.scope, city_ids: cityIds, link_url: link, owner_id: meId, owner_name: ownerName0 }).select("id").single();
      if (insL.error || !insL.data) {
        setBusy(false);
        return setErr("Lien non enregistré : " + (insL.error?.message ?? "erreur"));
      }
      if (form.scope === "people") {
        const r = await supabase.from("useful_doc_recipients").insert(Array.from(form.people).map((uid) => ({ doc_id: insL.data!.id as string, user_id: uid })));
        if (r.error) setErr("Lien enregistré, mais l'envoi aux destinataires a échoué : " + r.error.message);
      }
      setBusy(false);
      setForm(null);
      setTab(form.scope === "shared" ? "shared" : "mine");
      return load();
    }
    const file = form.file;
    if (!file) {
      setBusy(false);
      return setErr("Choisis un fichier.");
    }
    if (!ALLOWED_EXT.includes(extOf(file.name))) {
      setBusy(false);
      return setErr("Type de fichier non accepté. Formats : " + ALLOWED_EXT.join(", ") + ".");
    }
    if (file.size > MAX_BYTES) {
      setBusy(false);
      return setErr("Fichier trop lourd (20 Mo maximum).");
    }
    const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", meId).maybeSingle();
    const ownerName = (prof?.full_name as string | null) || (prof?.email as string | null)?.split("@")[0] || "Équipe Linkee";
    const path = `${meId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const up = await supabase.storage.from("useful-docs").upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setBusy(false);
      return setErr("Envoi du fichier impossible : " + up.error.message);
    }
    const ins = await supabase.from("useful_docs").insert({ title, description, rubric: form.rubric, scope: form.scope, city_ids: cityIds, storage_path: path, file_name: file.name, mime: file.type || null, size_bytes: file.size, owner_id: meId, owner_name: ownerName }).select("id").single();
    if (ins.error || !ins.data) {
      await supabase.storage.from("useful-docs").remove([path]);
      setBusy(false);
      return setErr("Document non enregistré : " + (ins.error?.message ?? "erreur"));
    }
    if (form.scope === "people") {
      const r = await supabase.from("useful_doc_recipients").insert(Array.from(form.people).map((uid) => ({ doc_id: ins.data!.id as string, user_id: uid })));
      if (r.error) setErr("Document enregistré, mais l'envoi aux destinataires a échoué : " + r.error.message);
    }
    setBusy(false);
    setForm(null);
    if (form.scope === "shared") setTab("shared");
    else setTab("mine");
    await load();
  }

  async function remove(d: Doc) {
    const mine = d.owner_id === meId;
    if (!window.confirm(mine || d.scope === "shared" ? `Supprimer « ${d.title} » ? ${d.scope === "shared" ? "Il disparaît pour tout le monde." : d.scope === "people" ? "Il disparaît aussi chez les destinataires." : ""}` : `Retirer « ${d.title} » de ton espace ?`)) return;
    if (!mine && d.scope === "people") {
      const { error } = await supabase.from("useful_doc_recipients").delete().eq("doc_id", d.id).eq("user_id", meId ?? "");
      if (error) return setErr("Retrait impossible : " + error.message);
      return load();
    }
    const { data, error } = await supabase.from("useful_docs").delete().eq("id", d.id).select("id");
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "refusée par la base"));
    if (d.storage_path) await supabase.storage.from("useful-docs").remove([d.storage_path]);
    await load();
  }

  const tag = (text: string, cls: string, title?: string) => (
    <span title={title} className={`ml-1.5 inline-block rounded-[40px] px-2 py-px align-middle text-[10.5px] font-bold tracking-[0.02em] uppercase ${cls}`}>{text}</span>
  );

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Documents utiles</h1>
      <p className="mb-4 text-[13.5px] text-[var(--slate)]">Les documents de référence de Linkee, et les tiens.</p>

      {err && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr(null)}>×</button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un document ou une description…" className={`${fieldCls} max-w-[520px] flex-1`} />
        <button type="button" onClick={openNew} className="rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]">+ Ajouter un document</button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {["", ...RUBRICS].map((r) => (
          <button key={r || "all"} type="button" onClick={() => setRub(r)} className={`rounded-[40px] border px-3 py-1 text-[12.5px] font-semibold ${rub === r ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] text-[var(--slate)] hover:border-[var(--turquoise)]"}`}>
            {r || "Toutes les rubriques"}
          </button>
        ))}
      </div>

      <div className="mb-2 inline-flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px]">
        <button type="button" onClick={() => selectTab("shared")} className={`flex items-center gap-2 rounded-[40px] px-[18px] py-2 text-[13.5px] font-bold ${tab === "shared" ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
          Partagés par Linkee <span className="rounded-[40px] bg-[var(--card)] px-2 text-[11px] text-[var(--navy)]">{inShared.length}</span>
        </button>
        <button type="button" onClick={() => selectTab("mine")} className={`flex items-center gap-2 rounded-[40px] px-[18px] py-2 text-[13.5px] font-bold ${tab === "mine" ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
          Mes documents <span className="rounded-[40px] bg-[var(--card)] px-2 text-[11px] text-[var(--navy)]">{inMine.length}</span>
          {hasNew && tab !== "mine" && <span title="Nouveau document transmis" className="h-2.5 w-2.5 rounded-full bg-[#eb6834]" />}
        </button>
      </div>
      <p className="mb-3 text-[12.5px] text-[var(--slate)]">
        {tab === "shared"
          ? isPublisher
            ? "Ce que tu publies ici est visible par les équipes des villes que tu choisis. Tu peux le modifier ou le retirer."
            : "Publiés par Linkee (Superadmin et Comptabilité), pour toutes les villes ou pour la tienne : tu peux les ouvrir et les télécharger."
          : "Personne d'autre ne les voit, pas même le Superadmin. Y arrivent aussi les documents qu'une personne te transmet."}
      </p>

      {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
      {!loading && visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-6 text-center text-[13px] text-[var(--slate)]">
          {(tab === "shared" ? inShared : inMine).length === 0 ? (tab === "shared" ? "Aucun document partagé pour l'instant." : "Tu n'as encore aucun document. Clique sur « Ajouter un document ».") : "Aucun document ne correspond à ta recherche."}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {visible.map((d) => {
          const k = d.link_url ? linkKind(d.link_url) : kindOf(d.file_name ?? "");
          const mine = d.owner_id === meId;
          const canEdit = mine || (d.scope === "shared" && isPublisher);
          const sentTo = d.scope === "people" && mine ? recips.filter((r) => r.doc_id === d.id) : [];
          return (
            <div key={d.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 shadow-[var(--shadow)]">
              <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-[10px] text-[11px] font-black ${k.cls}`}>{k.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold text-[var(--navy)]">
                  {d.title}
                  {tag(d.rubric, "bg-[rgba(124,92,217,.14)] text-[#7C5CD9]")}
                  {d.scope === "shared" && tag(d.city_ids.length === 0 ? "Toutes les villes" : d.city_ids.map((c) => cityName.get(c) ?? "?").join(", "), "bg-[var(--good-bg)] text-[var(--good)]")}
                  {d.scope === "people" && !mine && tag(`Transmis par ${d.owner_name ?? "l'équipe"}`, "bg-[var(--warn-bg)] text-[var(--warn)]")}
                  {d.scope === "people" && mine && tag(`Envoyé à ${sentTo.length} personne${sentTo.length > 1 ? "s" : ""}`, "bg-[var(--track)] text-[var(--slate)]", sentTo.map((r) => personName.get(r.user_id) ?? "").filter(Boolean).join(", "))}
                </div>
                <div className="mt-0.5 text-[13px] text-[var(--navy)]">{d.description}</div>
                <div className="mt-0.5 text-[11.5px] text-[var(--slate)]">
                  {d.link_url ? `Lien · ${k.label}` : d.file_name}
                  {!d.link_url && d.size_bytes != null ? ` · ${fmtSize(d.size_bytes)}` : ""} · ajouté {d.owner_name && d.scope === "shared" ? `par ${d.owner_name} ` : ""}le {fmtDate(d.created_at)}
                </div>
              </div>
              <div className="flex flex-none items-center gap-1.5">
                <button type="button" onClick={() => openDoc(d)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)]">{d.link_url ? "Ouvrir le lien ↗" : "Ouvrir"}</button>
                {canEdit && <button type="button" onClick={() => openEdit(d)} title="Modifier le titre et la description" className="h-8 w-8 rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--turquoise)]">✎</button>}
                {(canEdit || (d.scope === "people" && !mine)) && <button type="button" onClick={() => remove(d)} title={canEdit ? "Supprimer" : "Retirer de mon espace"} className="h-8 w-8 rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--critical)] hover:text-[var(--critical)]">×</button>}
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,10,30,0.45)] p-4" onClick={() => !busy && setForm(null)}>
          <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-[560px] overflow-auto rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[21px] font-black text-[var(--navy)]">{form.id ? "Modifier le document" : "Ajouter un document"}</h3>
            {!form.id && (
              <div className="mt-3 inline-flex rounded-[40px] bg-[var(--track)] p-[3px]">
                {([["file", "Fichier"], ["link", "Lien (Google Drive, Sheets, Docs…)"]] as const).map(([m, l]) => (
                  <button key={m} type="button" onClick={() => setForm({ ...form, mode: m })} className={`rounded-[40px] px-4 py-1.5 text-[12.5px] font-bold ${form.mode === m ? "bg-[var(--card)] text-[var(--navy)] shadow-[var(--shadow)]" : "text-[var(--slate)]"}`}>{l}</button>
                ))}
              </div>
            )}
            {form.mode === "link" && (
              <>
                <label className={labelCls}>Adresse du lien</label>
                <input className={fieldCls} inputMode="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                <p className="mt-1 text-[11.5px] text-[var(--slate)]">Pense à régler le partage dans Google : Linkee n&apos;affiche le lien qu&apos;aux personnes choisies, mais c&apos;est Google qui donne (ou non) l&apos;accès au fichier.</p>
              </>
            )}
            {!form.id && form.mode === "file" && (
              <>
                <label className={labelCls}>Fichier</label>
                <button type="button" onClick={() => fileInput.current?.click()} className="w-full rounded-[10px] border-[1.5px] border-dashed border-[var(--border)] px-3 py-4 text-center text-[13px] text-[var(--slate)] hover:border-[var(--turquoise)]">
                  {form.file ? `📎 ${form.file.name} (${fmtSize(form.file.size)})` : "Choisir un fichier (PDF, Word, Excel, image…) · 20 Mo maximum"}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept={ALLOWED_EXT.map((e) => "." + e).join(",")}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (f) setForm((cur) => (cur ? { ...cur, file: f, title: cur.title || f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") } : cur));
                  }}
                />
              </>
            )}
            <label className={labelCls}>Titre</label>
            <input className={fieldCls} value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <label className={labelCls}>Brève description (obligatoire, visible dans la liste)</label>
            <textarea className={fieldCls} rows={2} maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="À quoi sert ce document ?" />
            <div className="text-right text-[11px] text-[var(--slate)]">{form.description.length} / 200</div>
            <label className={labelCls}>Rubrique</label>
            <select className={fieldCls} value={form.rubric} onChange={(e) => setForm({ ...form, rubric: e.target.value })}>
              {RUBRICS.map((r) => <option key={r}>{r}</option>)}
            </select>

            {!form.id && (isPublisher || isSender) && (
              <>
                <label className={labelCls}>Qui peut le voir ?</label>
                <select className={fieldCls} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as Form["scope"] })}>
                  <option value="private">Moi seul</option>
                  {isPublisher && <option value="shared">Pour tout le monde (partagé par Linkee)</option>}
                  {isSender && <option value="people">Seulement certaines personnes (envoi dans leur espace personnel)</option>}
                </select>
              </>
            )}
            {form.scope === "shared" && isPublisher && (
              <>
                <label className={labelCls}>Villes concernées</label>
                <div className="flex flex-wrap gap-1.5">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-[40px] border border-[var(--border)] px-3 py-1 text-[12.5px] font-semibold text-[var(--navy)]">
                    <input type="checkbox" className="accent-[var(--turquoise)]" checked={form.allCities} onChange={(e) => setForm({ ...form, allCities: e.target.checked })} /> Toutes les villes
                  </label>
                  {!form.allCities &&
                    cities.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-1.5 rounded-[40px] border border-[var(--border)] px-3 py-1 text-[12.5px] font-semibold text-[var(--navy)]">
                        <input type="checkbox" className="accent-[var(--turquoise)]" checked={form.cityIds.has(c.id)} onChange={(e) => { const s = new Set(form.cityIds); if (e.target.checked) s.add(c.id); else s.delete(c.id); setForm({ ...form, cityIds: s }); }} /> {c.name}
                      </label>
                    ))}
                </div>
              </>
            )}
            {form.scope === "people" && !form.id && (
              <>
                <label className={labelCls}>Envoyer à (une ou plusieurs personnes)</label>
                <div className="max-h-[170px] overflow-y-auto rounded-[10px] border border-[var(--border)] p-1.5">
                  {people.length === 0 && <p className="p-2 text-[12.5px] text-[var(--slate)]">Aucune personne trouvée.</p>}
                  {people.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--navy)] hover:bg-[var(--input-bg)]">
                      <input type="checkbox" className="accent-[var(--turquoise)]" checked={form.people.has(p.id)} onChange={(e) => { const s = new Set(form.people); if (e.target.checked) s.add(p.id); else s.delete(p.id); setForm({ ...form, people: s }); }} />
                      <span className="flex-1 font-semibold">{p.full_name}</span>
                      <span className="text-[11.5px] text-[var(--slate)]">{ROLE_LABEL[p.role] ?? p.role}{p.city_name ? ` · ${p.city_name}` : ""}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11.5px] text-[var(--slate)]">Seules ces personnes le verront, dans « Mes documents », avec la mention « Transmis par {isPublisher ? "…" : "la RH"} ».</p>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 font-display text-[12.5px] font-bold text-[var(--slate)]">Annuler</button>
              <button type="button" disabled={busy || !form.title.trim() || !form.description.trim() || (!form.id && form.mode === "file" && !form.file) || (form.mode === "link" && !form.url.trim())} onClick={save} className="rounded-[40px] bg-[var(--navy-deep)] px-5 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)] disabled:opacity-50">
                {busy ? "Enregistrement…" : form.id ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
