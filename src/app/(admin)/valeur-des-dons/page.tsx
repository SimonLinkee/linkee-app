"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BAREME_SELECT, CAT_KEYS, CAT_LABELS, UNIT_LABEL, type Bareme, type Unit } from "@/lib/stats";

const PARTNER_CATS = ["Boulangerie", "Supermarché", "Traiteur", "Hôtel", "Restauration rapide", "Restauration collective", "Industriel", "Grossiste"];
const CAT_COLOR = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
const inputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

/** Valeur des dons par défaut, par type de partenaire — s'applique automatiquement à tous les partenaires de ce
 * type (chacun peut ensuite la personnaliser dans son propre onglet Valorisation, sans jamais toucher cette
 * valeur partagée). Anciennement "Barèmes" — nom conservé côté base (table category_baremes) mais renommé
 * partout dans l'interface. */
export default function ValeurDesDonsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [cat, setCat] = useState(PARTNER_CATS[0]);
  const [items, setItems] = useState<Bareme[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("category_baremes").select(BAREME_SELECT).eq("partner_category", cat).order("created_at");
    if (error) setMsg("Chargement impossible : " + error.message + " (la migration 028 est-elle passée ?)");
    setItems(((data ?? []) as unknown as Bareme[]).map((b) => ({ ...b, unit_price: Number(b.unit_price), unit_weight_kg: b.unit_weight_kg == null ? null : Number(b.unit_weight_kg) })));
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  function flash() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }
  async function patch(id: string, p: Partial<Bareme>) {
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)));
    const { error } = await supabase.from("category_baremes").update(p).eq("id", id);
    if (error) setMsg("Enregistrement impossible : " + friendlyError(error.message));
    else flash();
  }
  async function add(denree: string) {
    const name = (adding[denree] ?? "").trim();
    if (!name) return;
    const { data, error } = await supabase.from("category_baremes").insert({ partner_category: cat, category: denree, name, unit: "kg", unit_price: 0 }).select(BAREME_SELECT).single();
    if (error || !data) return setMsg("Ajout impossible : " + friendlyError(error?.message ?? "erreur"));
    setItems((prev) => [...prev, data as unknown as Bareme]);
    setAdding((a) => ({ ...a, [denree]: "" }));
    flash();
  }
  async function remove(b: Bareme) {
    if (!window.confirm(`Supprimer « ${b.name} » de la valeur des dons ${cat} ? Les partenaires qui l'avaient personnalisé gardent leur valeur ; les autres repassent au calcul par défaut.`)) return;
    const { error } = await supabase.from("category_baremes").delete().eq("id", b.id);
    if (error) return setMsg("Suppression impossible : " + friendlyError(error.message));
    setItems((prev) => prev.filter((x) => x.id !== b.id));
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-[32px] leading-none font-black">Valeur des dons par type de partenaire</h1>
        <p className="mt-1 text-[13.5px] text-[var(--slate)]">
          Une valeur s&apos;applique automatiquement à tous les partenaires du type choisi. Chaque partenaire peut ensuite la personnaliser (prix ou poids moyen) dans son propre onglet Valorisation, sans modifier cette valeur partagée. Une modification ici ne change jamais la valeur des collectes déjà enregistrées.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {PARTNER_CATS.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className={`rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold ${cat === c ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--slate)]"}`}>
            {c}
          </button>
        ))}
      </div>

      <div className={`mb-2 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Modifications enregistrées</div>
      {msg && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{msg}</div>}
      {loading && <p className="text-[13px] text-[var(--slate)]">Chargement…</p>}

      <div className="flex flex-col gap-3.5">
        {CAT_KEYS.map((k, ci) => {
          const label = CAT_LABELS[k];
          const list = items.filter((b) => b.category === label);
          return (
            <div key={k} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]" style={{ borderLeft: `5px solid ${CAT_COLOR[ci]}` }}>
              <div className="flex items-center justify-between bg-[var(--input-bg)] px-4 py-2.5">
                <span className="text-[14.5px] font-semibold text-[var(--navy)]">{label}</span>
                <span className="text-[11.5px] text-[var(--slate)]">{list.length} produit{list.length > 1 ? "s" : ""}</span>
              </div>
              <div className="px-4 py-2">
                {list.length === 0 && <p className="py-2 text-[12px] text-[var(--slate)]">Aucun produit dans la valeur des dons {cat} pour cette catégorie.</p>}
                {list.map((b) => (
                  <div key={b.id} className="border-b border-[var(--border)] py-2.5 last:border-none">
                    <div className="grid grid-cols-[1fr_92px_112px_auto] items-center gap-2">
                      <input className={inputCls} defaultValue={b.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== b.name && patch(b.id, { name: e.target.value.trim() })} aria-label="Nom du produit" />
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={`${inputCls} pr-6 text-right`}
                          defaultValue={b.unit_price}
                          onBlur={(e) => {
                            const v = Math.max(0, parseFloat(e.target.value) || 0);
                            if (v !== b.unit_price) patch(b.id, { unit_price: v });
                          }}
                          aria-label="Prix unitaire en euros"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] font-bold text-[var(--slate)]">€</span>
                      </div>
                      <select className={inputCls} value={b.unit} onChange={(e) => patch(b.id, { unit: e.target.value as Unit })} aria-label="Unité">
                        {(["unite", "kg"] as Unit[]).map((u) => (
                          <option key={u} value={u}>
                            par {u === "unite" ? "pièce" : "kg"}
                          </option>
                        ))}
                      </select>
                      <button type="button" title="Supprimer" onClick={() => remove(b)} className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                        ×
                      </button>
                    </div>
                    {b.unit === "unite" && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--warn-bg)] px-3 py-2">
                        <label className="flex-1 text-[12px] font-semibold text-[var(--navy)]">Poids moyen d&apos;une pièce</label>
                        <div className="relative w-[110px]">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            placeholder="0,125"
                            className={`${inputCls} pr-8 text-right`}
                            defaultValue={b.unit_weight_kg ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value));
                              if (v !== b.unit_weight_kg) patch(b.id, { unit_weight_kg: v });
                            }}
                            aria-label="Poids moyen d'une pièce en kg"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] font-bold text-[var(--slate)]">kg</span>
                        </div>
                      </div>
                    )}
                    {b.unit === "unite" && !b.unit_weight_kg && <p className="mt-1 text-[11px] text-[var(--critical)]">Indique le poids moyen d&apos;une pièce : requis pour compter ce produit dans les statistiques de poids.</p>}
                  </div>
                ))}
                <div className="flex gap-2 py-2.5">
                  <input
                    className={inputCls}
                    placeholder={`Ajouter un produit dans « ${label} »`}
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

/** Rend le message plus clair juste après une migration (le cache de schéma de Supabase met parfois une minute
 * à reconnaître une table ou une colonne toute neuve) plutôt que de laisser un message Postgres brut. */
function friendlyError(message: string): string {
  if (/schema cache/i.test(message)) return message + " — si tu viens de passer une migration, recharge la page dans une minute.";
  return message;
}
