// Dépose partielle : les quantités se choisissent par tranches de 5 kg (5, 10, 15…), la dernière étant « tout ce qui reste ».
export const TRANCHE_KG = 5;

/** Quantités proposées pour un reste de `rem` kg : 5, 10, 15… puis le reste exact (ex. reste 12,4 → 5, 10, 12,4). */
export function trancheOptions(rem: number): number[] {
  const out: number[] = [];
  for (let k = TRANCHE_KG; k < rem - 0.001; k += TRANCHE_KG) out.push(k);
  if (rem > 0) out.push(Math.round(rem * 100) / 100);
  return out;
}

/** Tranche voisine (dir = +1 / −1) de la valeur courante ; reste dans la liste. */
export function stepTranche(rem: number, current: number, dir: 1 | -1): number {
  const opts = trancheOptions(rem);
  if (!opts.length) return 0;
  const i = opts.findIndex((o) => o >= current - 0.001);
  const cur = i === -1 ? opts.length - 1 : i;
  return opts[Math.max(0, Math.min(opts.length - 1, cur + dir))];
}
