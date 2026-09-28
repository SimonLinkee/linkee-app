"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CAT_KEYS, CAT_LABELS, DEFAULT_EUR_PER_KG, SUBCAT_SELECT, UNIT_LABEL, type SubCat, type Unit } from "@/lib/stats";

const CAT_COLOR = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
const inputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

/** "Valorisation RSE": sub-categories per partner with a unit price. Used by the admin fiche and by the partner space. */
export default function PartnerValuation({ partnerId }: { partnerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [subs, setSubs] = useState<SubCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("partner_subcategories").select(SUBCAT_SELECT).eq("partner_id", partnerId).order("created_at");
    if (error) setMsg("Chargement impossible : " + error.message + " (la migration 013 est-elle passée ?)");
    setSubs(((data ?? []) as unknown as SubCat[]).map((s) => ({ ...s, unit_price: s.unit_price == null ? null : Number(s.unit_price), unit_weight_kg: s.unit_weight_kg == null ? null : Number(s.unit_weight_kg) })));
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  function flash() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }
  async function patch(id: string, p: Partial<SubCat>) {
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
    const { error } = await supabase.from("partner_subcategories").update(p).eq("id", id);
    if (error) setMsg("Enregistrement impossible : " + error.message);
    else flash();
  }
  async function add(category: string) {
    const name = (adding[category] ?? "").trim();
    if (!name) return;
    const { data, error } = await supabase.from("partner_subcategories").insert({ partner_id: partnerId, category, name, unit: "kg" }).select(SUBCAT_SELECT).single();
    if (error || !data) return setMsg("Ajout impossible : " + (error?.message ?? "erreur"));
    setSubs((prev) => [...prev, data as unknown as SubCat]);
    setAdding((a) => ({ ...a, [category]: "" }));
    flash();
  }
  async function remove(s: SubCat) {
    if (!window.confirm(`Supprimer la sous-catégorie « ${s.name} » ? Les collectes passées gardent leur poids, mais leur valeur repassera au tarif par défaut.`)) return;
    const { error } = await supabase.from("partner_subcategories").delete().eq("id", s.id);
    if (error) return setMsg("Suppression impossible : " + error.message);
    setSubs((prev) => prev.filter((x) => x.id !== s.id));
  }

  return (
    <div>
      <p className="mb-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">
        Crée des sous-catégories propres à ce partenaire et donne une <strong className="text-[var(--navy)]">valeur unitaire</strong> à chacune. Quand une valeur est renseignée, la <strong className="text-[var(--navy)]">valeur des dons</strong> (et donc la défiscalisation et la valeur
        sociale) est calculée avec ce prix. Sans valeur, on garde le calcul par défaut : {DEFAULT_EUR_PER_KG} € par kg.
      </p>
      <div className={`mb-2 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Modifications enregistrées</div>
      {msg && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{msg}</div>}
      {loading && <p className="text-[13px] text-[var(--slate)]">Chargement…</p>}

      <div className="flex flex-col gap-3.5">
        {CAT_KEYS.map((k, ci) => {
          const label = CAT_LABELS[k];
          const list = subs.filter((s) => s.category === label);
          return (
            <div key={k} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]" style={{ borderLeft: `5px solid ${CAT_COLOR[ci]}` }}>
              <div className="flex items-center justify-between bg-[var(--input-bg)] px-4 py-2.5">
                <span className="font-display text-[15px] font-extrabold text-[var(--navy)]">{label}</span>
                <span className="text-[11.5px] text-[var(--slate)]">{list.length} sous-catégorie{list.length > 1 ? "s" : ""}</span>
              </div>
              <div className="px-4 py-2">
                {list.length === 0 && <p className="py-2 text-[12px] text-[var(--slate)]">Aucune sous-catégorie : les produits de cette catégorie sont valorisés à {DEFAULT_EUR_PER_KG} €/kg.</p>}
                {list.map((s) => (
                  <div key={s.id} className="border-b border-[var(--border)] py-2.5 last:border-none">
                    <div className="grid grid-cols-[1fr_92px_112px_auto] items-center gap-2">
                      <input className={inputCls} defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && patch(s.id, { name: e.target.value.trim() })} aria-label="Nom de la sous-catégorie" />
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="—"
                          className={`${inputCls} pr-6 text-right`}
                          defaultValue={s.unit_price ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value));
                            if (v !== s.unit_price) patch(s.id, { unit_price: v });
                          }}
                          aria-label="Valeur unitaire en euros"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] font-bold text-[var(--slate)]">€</span>
                      </div>
                      <select className={inputCls} value={s.unit} onChange={(e) => patch(s.id, { unit: e.target.value as Unit })} aria-label="Unité">
                        {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
                          <option key={u} value={u}>
                            par {UNIT_LABEL[u]}
                          </option>
                        ))}
                      </select>
                      <button type="button" title="Supprimer" onClick={() => remove(s)} className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                        ×
                      </button>
                    </div>
                    {s.unit === "unite" && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--warn-bg)] px-3 py-2">
                        <label className="flex-1 text-[12px] font-semibold text-[var(--navy)]">Poids d&apos;une unité</label>
                        <div className="relative w-[110px]">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            placeholder="0,125"
                            className={`${inputCls} pr-8 text-right`}
                            defaultValue={s.unit_weight_kg ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value));
                              if (v !== s.unit_weight_kg) patch(s.id, { unit_weight_kg: v });
                            }}
                            aria-label="Poids d'une unité en kg"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] font-bold text-[var(--slate)]">kg</span>
                        </div>
                      </div>
                    )}
                    {s.unit === "unite" && !s.unit_weight_kg && <p className="mt-1 text-[11px] text-[var(--critical)]">Indique le poids d&apos;une unité : il sert à compter ces produits dans les statistiques de poids.</p>}
                  </div>
                ))}
                <div className="flex gap-2 py-2.5">
                  <input
                    className={inputCls}
                    placeholder={`Ajouter une sous-catégorie dans « ${label} »`}
                    value={adding[label] ?? ""}
                    onChange={(e) => setAdding((a) => ({ ...a, [label]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && add(label)}
                  />
                  <button type="button" onClick={() => add(label)} className="flex-none rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)]">
                    + Ajouter
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
