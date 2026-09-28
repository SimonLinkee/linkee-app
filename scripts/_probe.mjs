import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
for (const p of ["partners?select=id,name,passage:fiche->passage&limit=2", "collectes?select=id,partners(name,category,address,passage:fiche->passage)&limit=1"]) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: H });
  console.log(r.ok ? "OK " : "ERR", p.slice(0, 50), (await r.text()).slice(0, 160));
}
