"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLinker } from "@/components/linker/LinkerContext";
import { geocode, toKm } from "@/lib/geocode";

type Rel = { name: string; address: string | null; contacts?: { tel?: string }[] } | null;
type LinkRow = {
  id: string; status: string; kg_estime: number; is_fresh: boolean; window_date: string; window_from: string; window_to: string;
  asso_confirmed: boolean; linker_id: string | null; partners: Rel; beneficiaries: (Rel & { contacts?: { type?: string; tel?: string }[] }) | null;
};

const fmtWin = (r: LinkRow) => `${r.window_from.slice(0, 5)} – ${r.window_to.slice(0, 5)}`;
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export default function LinkFichePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { linker } = useLinker();
  const [row, setRow] = useState<LinkRow | null>(null);
  const [dist, setDist] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [weight, setWeight] = useState("");

  async function load() {
    const { data } = await supabase
      .from("links")
      .select("id,status,kg_estime,is_fresh,window_date,window_from,window_to,asso_confirmed,linker_id,partners(name,address),beneficiaries(name,address,contacts)")
      .eq("id", params.id)
      .maybeSingle();
    const r = data as unknown as LinkRow | null;
    setRow(r);
    setWeight(r ? String(r.kg_estime) : "");
    setLoading(false);
    if (r?.partners?.address && r?.beneficiaries?.address) {
      const [a, b] = await Promise.all([geocode(r.partners.address), geocode(r.beneficiaries.address)]);
      if (a && b) setDist(Math.hypot(toKm(b, a).x, toKm(b, a).y));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;
  if (!row) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Ce Link n&apos;existe plus — il a peut-être été pris par un autre Linker.</p>;

  const mine = row.linker_id === linker?.id;
  const assoTel = row.beneficiaries?.contacts?.find((c) => c.tel)?.tel;

  async function toggleConfirmed() {
    if (!row) return;
    const { error } = await supabase.from("links").update({ asso_confirmed: !row.asso_confirmed }).eq("id", row.id);
    if (!error) setRow({ ...row, asso_confirmed: !row.asso_confirmed });
  }
  async function accept() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("accept_link", { p_link_id: row!.id });
    setBusy(false);
    if (error) { setErr(error.message); return load(); }
    load();
  }
  async function collected() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("mark_link_collected", { p_link_id: row!.id });
    setBusy(false);
    if (error) return setErr(error.message);
    load();
  }
  async function deliver() {
    const w = parseFloat(weight.replace(",", "."));
    if (!w || w <= 0) return setErr("Indique le poids livré.");
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("deliver_link", { p_link_id: row!.id, p_weight: w });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/linker/recompense");
  }

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <button type="button" onClick={() => router.push("/linker/carte")} className="w-fit text-[13px] font-bold text-[var(--slate)]">← Carte des Links</button>

      <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <span className="inline-flex items-center gap-1.5 rounded-[40px] px-3 py-1 text-[11.5px] font-bold text-white" style={{ background: row.is_fresh ? "#4fc1d6" : row.kg_estime > 25 ? "#2a78d6" : "#ff9a3c" }}>
          {row.is_fresh ? "🧊 Collecte de frais" : row.kg_estime > 25 ? "🚗 Collecte voiture" : "🎒 Collecte sac à dos"}
        </span>
        <h1 className="mt-2 font-display text-[24px] font-black text-[var(--navy)]">{row.partners?.name}</h1>
        <p className="text-[13px] font-semibold text-[var(--slate)]">{row.partners?.address}</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-[14px] bg-[var(--track)] p-2.5 text-center">
            <div className="font-display text-[18px] font-black text-[var(--navy)]">{row.kg_estime} kg</div>
            <div className="text-[10px] font-bold text-[var(--slate)]">volume estimé</div>
          </div>
          <div className="rounded-[14px] bg-[var(--track)] p-2.5 text-center">
            <div className="font-display text-[13px] leading-tight font-black text-[var(--navy)]">{fmtDay(row.window_date)}<br />{fmtWin(row)}</div>
            <div className="text-[10px] font-bold text-[var(--slate)]">fenêtre</div>
          </div>
          <div className="rounded-[14px] bg-[var(--good-bg)] p-2.5 text-center">
            <div className="font-display text-[18px] font-black text-[var(--good)]">+1</div>
            <div className="text-[10px] font-bold text-[var(--slate)]">level à la livraison</div>
          </div>
        </div>

        <div className="mt-3 rounded-[16px] bg-[#f4f8ff] p-3">
          <div className="text-[10.5px] font-bold tracking-[0.03em] text-[var(--blue,#2a78d6)] uppercase">🏠 Association de destination</div>
          <div className="font-display text-[17px] font-extrabold text-[var(--navy)]">{row.beneficiaries?.name}</div>
          <div className="text-[12.5px] font-semibold text-[var(--slate)]">{row.beneficiaries?.address}</div>
          {dist != null && <div className="mt-1 text-[12px] font-bold text-[var(--navy)]">Trajet magasin → asso : {dist.toFixed(1)} km</div>}
          {assoTel && (
            <a href={`tel:${assoTel}`} className="mt-2.5 flex min-h-[42px] items-center justify-center gap-2 rounded-[40px] bg-[var(--good)] font-display text-[14px] font-bold text-white">
              📞 Appeler {assoTel}
            </a>
          )}
        </div>

        {row.status === "proposee" && !row.linker_id && (
          <>
            <button type="button" onClick={toggleConfirmed} className="mt-3 flex min-h-[50px] w-full items-center gap-2.5 rounded-[16px] border-2 p-3 text-left text-[13.5px] font-bold" style={{ borderColor: row.asso_confirmed ? "var(--good)" : "var(--sun-d,#e0a800)", background: row.asso_confirmed ? "var(--good-bg)" : "#fff7dd" }}>
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[8px] text-white" style={{ background: row.asso_confirmed ? "var(--good)" : "#fff", border: row.asso_confirmed ? "none" : "2px solid var(--sun-d,#e0a800)", color: row.asso_confirmed ? "#fff" : "transparent" }}>✓</span>
              Asso contactée, livraison OK
            </button>
            {err && <p className="mt-2 rounded-[12px] bg-[var(--critical-bg)] px-3 py-2 text-[12.5px] font-bold text-[var(--critical)]">{err}</p>}
            <button type="button" disabled={!row.asso_confirmed || busy} onClick={accept} className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-[40px] bg-[var(--navy-deep)] font-display text-[16px] font-bold text-[var(--panel-fg)] disabled:opacity-45">
              {busy ? "…" : "Accepter ce Link"}
            </button>
            <p className="mt-1.5 text-center text-[11px] font-semibold text-[var(--muted)]">Premier arrivé, premier servi — appelle l&apos;asso avant d&apos;accepter.</p>
          </>
        )}

        {mine && row.status === "acceptee" && (
          <>
            <div className="mt-3 rounded-[14px] bg-[var(--warn-bg)] px-3 py-2 text-[12.5px] font-bold text-[var(--navy)]">🕐 Passe chez {row.partners?.name} entre {fmtWin(row)}.</div>
            {err && <p className="mt-2 rounded-[12px] bg-[var(--critical-bg)] px-3 py-2 text-[12.5px] font-bold text-[var(--critical)]">{err}</p>}
            <button type="button" disabled={busy} onClick={collected} className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-[40px] bg-[var(--good)] font-display text-[16px] font-bold text-white disabled:opacity-60">
              🎒 J&apos;ai récupéré les produits
            </button>
          </>
        )}

        {mine && row.status === "collectee" && (
          <div className="mt-3 rounded-[16px] bg-[#fff7dd] p-3">
            <div className="font-display text-[15px] font-extrabold text-[var(--navy)]">⚖️ Pèse ce que tu livres</div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setWeight(String(Math.max(0, (parseFloat(weight) || 0) - 0.5)))} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-[22px] font-bold text-[var(--navy)] shadow">−</button>
              <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className="w-[110px] rounded-[14px] border-2 border-[var(--border)] bg-white py-2 text-center font-display text-[26px] font-black text-[var(--navy)]" />
              <button type="button" onClick={() => setWeight(String((parseFloat(weight) || 0) + 0.5))} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-[22px] font-bold text-[var(--navy)] shadow">+</button>
            </div>
            {err && <p className="mt-2 rounded-[12px] bg-[var(--critical-bg)] px-3 py-2 text-[12.5px] font-bold text-[var(--critical)]">{err}</p>}
            <button type="button" disabled={busy} onClick={deliver} className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-[40px] bg-[var(--good)] font-display text-[16px] font-bold text-white disabled:opacity-60">
              ✅ Livré à l&apos;association
            </button>
          </div>
        )}

        {(row.status === "livree" || (row.status !== "proposee" && !mine)) && (
          <div className="mt-3 rounded-[14px] bg-[var(--track)] px-3 py-2.5 text-center text-[13px] font-bold text-[var(--slate)]">
            {row.status === "livree" ? "✅ Ce Link est terminé." : "Ce Link a été pris par un autre Linker."}
          </div>
        )}
      </div>
    </div>
  );
}
