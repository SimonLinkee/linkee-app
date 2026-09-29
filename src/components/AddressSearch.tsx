"use client";

import { useEffect, useRef, useState } from "react";

export type AddressHit = { label: string; lat: number; lng: number; postcode: string; city: string };

/**
 * Champ de recherche d'adresse : interroge la Base Adresse Nationale (api-adresse.data.gouv.fr) au fil de la
 * frappe et ne fait remonter (onPick) que des adresses réellement référencées, avec leurs coordonnées — pour
 * garantir que l'adresse enregistrée est géolocalisable (donc utilisable par les distances Links Bénévoles).
 * Le texte tapé reste éditable librement (onChange) ; c'est le choix d'une suggestion (onPick) qui "valide" l'adresse.
 */
export default function AddressSearch({
  value,
  onChange,
  onPick,
  onBlur,
  placeholder,
  className,
  verified,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (hit: AddressHit) => void;
  onBlur?: () => void; // pour enregistrer le texte tel quel si l'utilisateur ne choisit pas de suggestion (adresse rare non référencée)
  placeholder?: string;
  className: string;
  verified?: boolean; // affiche un badge quand l'adresse actuelle vient d'une sélection dans la liste
}) {
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`);
        const json = await res.json();
        type Feature = { properties: { label: string; postcode: string; city: string }; geometry: { coordinates: [number, number] } };
        const list: AddressHit[] = ((json?.features ?? []) as Feature[]).map((f) => ({
          label: f.properties.label,
          postcode: f.properties.postcode,
          city: f.properties.city,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        }));
        setHits(list);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
      />
      {verified && !open && value.trim() && (
        <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[11px] font-bold text-[var(--good)]">✓ vérifiée</span>
      )}
      {open && (loading || hits.length > 0) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
          {loading && <div className="px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--slate)]">Recherche…</div>}
          {!loading &&
            hits.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onPick(h);
                  setOpen(false);
                  setHits([]);
                }}
                className="block w-full border-b border-[var(--border)] px-3.5 py-2.5 text-left text-[13px] font-semibold text-[var(--navy)] last:border-b-0 hover:bg-[var(--input-bg)]"
              >
                {h.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
