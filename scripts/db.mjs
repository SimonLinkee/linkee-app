#!/usr/bin/env node
// READ-ONLY window on the Linkee database, for Claude Code (or you) to look at the data and its history.
//
//   node scripts/db.mjs tables                                  list the tables and their row counts
//   node scripts/db.mjs select <table> [--limit 50] [--where col=value] [--order col] [--desc]
//   node scripts/db.mjs audit [--table partners] [--limit 50] [--since 2026-09-01] [--actor email]
//   node scripts/db.mjs backup                                  full JSON export into ./backups/ (git-ignored)
//
// Needs, in .env.local:  NEXT_PUBLIC_SUPABASE_URL  and  SUPABASE_SERVICE_ROLE_KEY.
// It only ever sends GET requests: it cannot change anything in the database.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local (voir .env.local.example).");
  process.exit(1);
}

const TABLES = [
  "cities", "profiles", "partners", "partner_users", "beneficiaries", "vehicles", "vehicle_events", "collectes", "collecte_items",
  "exceptional_requests", "checklist_templates", "checklist_overrides", "day_sessions", "stock_items", "stock_movements", "documents", "notifications", "audit_log",
];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

async function get(path, extraHeaders = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { method: "GET", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extraHeaders } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return { json: text ? JSON.parse(text) : [], headers: res.headers };
}

function table(t) {
  if (!TABLES.includes(t)) throw new Error(`Table inconnue « ${t} ». Tables : ${TABLES.join(", ")}`);
  return t;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

try {
  if (cmd === "tables") {
    for (const t of TABLES) {
      const { headers } = await get(`${t}?select=*&limit=1`, { Prefer: "count=exact" });
      console.log(`${t.padEnd(22)} ${(headers.get("content-range") || "").split("/")[1] ?? "?"} ligne(s)`);
    }
  } else if (cmd === "select") {
    const t = table(args._[1]);
    const q = [`select=*`, `limit=${Number(args.limit) || 50}`];
    if (args.order) q.push(`order=${args.order}.${args.desc ? "desc" : "asc"}`);
    if (typeof args.where === "string") {
      const [col, ...rest] = args.where.split("=");
      q.push(`${col}=eq.${encodeURIComponent(rest.join("="))}`);
    }
    const { json } = await get(`${t}?${q.join("&")}`);
    console.log(JSON.stringify(json, null, 2));
    console.error(`(${json.length} ligne(s))`);
  } else if (cmd === "audit") {
    const q = ["select=at,actor_email,table_name,row_id,action,old_row,new_row", "order=at.desc", `limit=${Number(args.limit) || 50}`];
    if (typeof args.table === "string") q.push(`table_name=eq.${table(args.table)}`);
    if (typeof args.since === "string") q.push(`at=gte.${args.since}`);
    if (typeof args.actor === "string") q.push(`actor_email=eq.${encodeURIComponent(args.actor)}`);
    const { json } = await get(`audit_log?${q.join("&")}`);
    for (const e of json) {
      const row = e.new_row ?? e.old_row ?? {};
      const label = row.name ?? row.label ?? row.email ?? row.full_name ?? row.destination ?? e.row_id ?? "";
      console.log(`${e.at}  ${e.action.padEnd(6)} ${e.table_name.padEnd(20)} ${String(label).slice(0, 40).padEnd(40)} par ${e.actor_email ?? "système"}`);
      if (e.action === "UPDATE" && e.old_row && e.new_row) {
        for (const k of Object.keys(e.new_row)) {
          if (k === "updated_at") continue;
          if (JSON.stringify(e.old_row[k]) !== JSON.stringify(e.new_row[k])) {
            const cut = (v) => String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 80);
            console.log(`      ${k}: ${cut(e.old_row[k])}  →  ${cut(e.new_row[k])}`);
          }
        }
      }
    }
    console.error(`(${json.length} entrée(s))`);
  } else if (cmd === "backup") {
    const data = {};
    for (const t of TABLES) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { json } = await get(`${t}?select=*`, { Range: `${from}-${from + 999}`, "Range-Unit": "items" });
        rows.push(...json);
        if (json.length < 1000) break;
      }
      data[t] = rows;
      console.error(`${t}: ${rows.length}`);
    }
    const dir = join(root, "backups");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `linkee-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify({ exported_at: new Date().toISOString(), tables: data }));
    console.log(`Export écrit : ${file}`);
  } else {
    console.log("Commandes : tables | select <table> [--limit N --where col=val --order col --desc] | audit [--table t --since AAAA-MM-JJ --actor email --limit N] | backup");
  }
} catch (e) {
  console.error("Erreur :", e.message);
  process.exit(1);
}
