"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BAREME_SELECT, CAT_KEYS, CAT_LABELS, DEFAULT_EUR_PER_KG, SUBCAT_SELECT, UNIT_LABEL, mergeBareme, type Bareme, type EffectiveSubCat, type SubCat, type Unit } from "@/lib/stats";

const CAT_COLOR = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
const inputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

/** "Valorisation RSE": reprend le barème par défaut du type de partenaire (modifiable/masquable par item, avec
 * retour à la valeur par défaut) et permet d'ajouter des sous-catégories propres à ce partenaire. Un prix
 * modifié ne s'applique qu'aux prochaines collectes — l'historique reste figé (valeur enregistrée sur chaque ligne). */
export default function PartnerValuation({ partnerId, category }: { partnerId: string; category: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [subs, setSubs] = useState<SubCat[]>([]);
  const [baremes, setBaremes] = useState<Bareme[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    const [s, b] = await Promise.all([
      supabase.from("partner_subcategories").select(SUBCAT_SELECT).eq("partner_id", partnerId).order("created_at"),
      supabase.from("category_baremes").select(BAREME_SELECT).eq("partner_category", category).order("created_at"),
    ]);
    if (s.error) setMsg("Chargement impossible : " + s.error.message + " (la migration 013 est-elle passée ?)");
    setSubs(((s.data ?? []) as unknown as SubCat[]).map((x) => ({ ...x, unit_price: x.unit_price == null ? null : Number(x.unit_price), unit_weight_kg: x.unit_weight_kg == null ? null : Number(x.unit_weight_kg) })));
    setBaremes(((b.data ?? []) as unknown as Bareme[]).map((x) => ({ ...x, unit_price: Number(x.unit_price), unit_weight_kg: x.unit_weight_kg == null ? null : Number(x.unit_weight_kg) })));
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, category]);

  const effective = useMemo(() => mergeBareme(category, baremes, subs), [category, baremes, subs]);

  function flash() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  /** Modifie un item : matérialise d'abord un override si c'est encore une valeur par défaut du barème. */
  async function editEffective(row: EffectiveSubCat, patch: Partial<Pick<SubCat, "unit_price" | "unit_weight_kg" | "name" | "unit">>) {
    if (row.isDefault) {
      const { data, error } = await supabase
        .from("partner_subcategories")
        .insert({ partner_id: partnerId, category: row.category, name: row.name, unit: row.unit, unit_price: row.unit_price, unit_weight_kg: row.unit_weight_kg, barem_id: row.barem_id, ...patch })
        .select(SUBCAT_SELECT)
        .single();
      if (error || !data) return setMsg("Enregistrement impossible : " + (error?.message ?? "erreur"));
      setSubs((prev) => [...prev, data as unknown as SubCat]);
    } else {
      setSubs((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...patch } : s)));
      const { error } = await supabase.from("partner_subcategories").update(patch).eq("id", row.id);
      if (error) return setMsg("Enregistrement impossible : " + error.message);
    }
    flash();
  }
  /** Revient à la valeur par défaut du barème (supprime l'override). */
  async function revert(row: EffectiveSubCat) {
    const { error } = await supabase.from("partner_subcategories").delete().eq("id", row.id);
    if (error) return setMsg("Impossible de revenir à la valeur par défaut : " + error.message);
    setSubs((prev) => prev.filter((s) => s.id !== row.id));
    flash();
  }
  /** Retire une sous-catégorie : suppression réelle si propre au partenaire, masquage sinon (le barème partagé n'est pas touché). */
  async function removeEffective(row: EffectiveSubCat) {
    if (!window.confirm(`Retirer « ${row.name} » ? Les collectes passées gardent leur valeur enregistrée.`)) return;
    if (row.barem_id) {
      if (row.isDefault) {
        const { data, error } = await supabase
          .from("partner_subcategories")
          .insert({ partner_id: partnerId, category: row.category, name: row.name, unit: row.unit, unit_price: row.unit_price, unit_weight_kg: row.unit_weight_kg, barem_id: row.barem_id, hidden: true })
          .select(SUBCAT_SELECT)
          .single();
        if (error || !data) return setMsg("Suppression impossible : " + (error?.message ?? "erreur"));
        setSubs((prev) => [...prev, data as unknown as SubCat]);
      } else {
        const { error } = await supabase.from("partner_subcategories").update({ hidden: true }).eq("id", row.id);
        if (error) return setMsg("Suppression impossible : " + error.message);
        setSubs((prev) => prev.map((s) => (s.id === row.id ? { ...s, hidden: true } : s)));
      }
    } else {
      const { error } = await supabase.from("partner_subcategories").delete().eq("id", row.id);
      if (error) return setMsg("Suppression impossible : " + error.message);
      setSubs((prev) => prev.filter((s) => s.id !== row.id));
    }
  }
  async function add(cat: string) {
    const name = (adding[cat] ?? "").trim();
    if (!name) return;
    const { data, error } = await supabase.from("partner_subcategories").insert({ partner_id: partnerId, category: cat, name, unit: "kg" }).select(SUBCAT_SELECT).single();
    if (error || !data) return setMsg("Ajout impossible : " + (error?.message ?? "erreur"));
    setSubs((prev) => [...prev, data as unknown as SubCat]);
    setAdding((a) => ({ ...a, [cat]: "" }));
    flash();
  }

  return (
    <div>
      <p className="mb-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">
        Reprend le <strong className="text-[var(--navy)]">barème par défaut</strong> du type de partenaire ({category || "aucun type"}). Modifie un prix ou un poids moyen pour ce partenaire précis (il s&apos;affiche alors comme <strong className="text-[var(--navy)]">personnalisé</strong>, avec un retour possible à la valeur par défaut) ou ajoute une sous-catégorie propre à ce partenaire. Une modification ne s&apos;applique qu&apos;aux prochaines collectes : l&apos;historique garde sa valeur d&apos;origine. Sans prix, le calcul par défaut reste {DEFAULT_EUR_PER_KG} € / kg.
      </p>
      <div className={`mb-2 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Modifications enregistrées</div>
      {msg && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{msg}</div>}
      {loading && <p className="text-[13px] text-[var(--slate)]">Chargement…</p>}

      <div className="flex flex-col gap-3.5">
        {CAT_KEYS.map((k, ci) => {
          const label = CAT_LABELS[k];
          const list = effective.filter((s) => s.category === label);
          return (
            <div key={k} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]" style={{ borderLeft: `5px solid ${CAT_COLOR[ci]}` }}>
              <div className="flex items-center justify-between bg-[var(--input-bg)] px-4 py-2.5">
                <span className="text-[14.5px] font-semibold text-[var(--navy)]">{label}</span>
                <span className="text-[11.5px] text-[var(--slate)]">{list.length} sous-catégorie{list.length > 1 ? "s" : ""}</span>
              </div>
              <div className="px-4 py-2">
                {list.length === 0 && <p className="py-2 text-[12px] text-[var(--slate)]">Aucune sous-catégorie : les produits de cette catégorie sont valorisés à {DEFAULT_EUR_PER_KG} €/kg.</p>}
                {list.map((s) => (
                  <div key={s.id} className="border-b border-[var(--border)] py-2.5 last:border-none">
                    <div className="mb-1 flex items-center gap-2">
                      {s.barem_id ? (
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--navy)]">{s.name}</span>
                      ) : (
                        <input className={inputCls} defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && editEffective(s, { name: e.target.value.trim() })} aria-label="Nom de la sous-catégorie" />
                      )}
                      <span className="flex-none rounded-[40px] px-2 py-0.5 text-[10px] font-bold" style={s.isDefault ? { background: "var(--track)", color: "var(--slate)" } : { background: "var(--good-bg)", color: "var(--good)" }}>
                        {s.isDefault ? "Par défaut" : "Personnalisée"}
                      </span>
                      {!s.isDefault && s.barem_id && (
                        <button type="button" onClick={() => revert(s)} className="flex-none text-[11px] font-bold text-[var(--turquoise-d,#0a8a9c)] underline">
                          Revenir à la valeur par défaut
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[92px_112px_auto] items-center gap-2">
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
                            if (v !== s.unit_price) editEffective(s, { unit_price: v });
                          }}
                          aria-label="Valeur unitaire en euros"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] font-bold text-[var(--slate)]">€</span>
                      </div>
                      {s.barem_id ? (
                        <span className="text-[12.5px] font-semibold text-[var(--slate)]">par {UNIT_LABEL[s.unit]}</span>
                      ) : (
                        <select className={inputCls} value={s.unit} onChange={(e) => editEffective(s, { unit: e.target.value as Unit })} aria-label="Unité">
                          {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
                            <option key={u} value={u}>
                              par {UNIT_LABEL[u]}
                            </option>
                          ))}
                        </select>
                      )}
                      <button type="button" title="Retirer" onClick={() => removeEffective(s)} className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                        ×
                      </button>
                    </div>
                    {s.unit === "unite" && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--warn-bg)] px-3 py-2">
                        <label className="flex-1 text-[12px] font-semibold text-[var(--navy)]">Poids moyen d&apos;une unité</label>
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
                              if (v !== s.unit_weight_kg) editEffective(s, { unit_weight_kg: v });
                            }}
                            aria-label="Poids moyen d'une unité en kg"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] font-bold text-[var(--slate)]">kg</span>
                        </div>
                      </div>
                    )}
                    {s.unit === "unite" && !s.unit_weight_kg && <p className="mt-1 text-[11px] text-[var(--critical)]">Indique le poids moyen d&apos;une unité : il sert à compter ces produits dans les statistiques de poids.</p>}
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
