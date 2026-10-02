"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photos";

// Onglet « Remontées » (bugs, questions, suggestions) : vocabulaire et utilitaires partagés entre la page utilisateur
// et la page Superadmin. À importer uniquement depuis des composants client.

export type RemonteeType = "bug" | "question" | "suggestion";
export type RemonteeStatus = "en_attente" | "en_cours" | "traite";
export type RemonteeAttachment = { path: string; name: string; size: number };
export type RemonteeRow = {
  id: string;
  author_id: string;
  author_role: string;
  city_id: string | null;
  type: RemonteeType;
  title: string;
  description: string;
  status: RemonteeStatus;
  page_path: string | null;
  user_agent: string | null;
  attachments: RemonteeAttachment[];
  attachments_purged_at: string | null;
  treated_at: string | null;
  super_seen_at: string | null;
  created_at: string;
  updated_at: string;
};
export type RemonteeMessage = { id: string; author_id: string; author_is_admin: boolean; body: string; created_at: string };

export const REMONTEE_COLOR = "#B23B72";
export const REMONTEE_SOFT = "rgba(178,59,114,0.12)";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const REMONTEE_TYPES: { k: RemonteeType; l: string; emoji: string; hint: string }[] = [
  { k: "bug", l: "Bug", emoji: "🐞", hint: "Quelque chose ne marche pas" },
  { k: "question", l: "Question", emoji: "❓", hint: "Une question sur le fonctionnement de l'appli" },
  { k: "suggestion", l: "Suggestion", emoji: "💡", hint: "Une idée d'amélioration ou de nouvelle fonctionnalité" },
];
export const REMONTEE_TYPE_LABEL: Record<RemonteeType, string> = { bug: "Bug", question: "Question", suggestion: "Suggestion" };

export const REMONTEE_STATUS_LABEL: Record<RemonteeStatus, string> = { en_attente: "En attente de traitement", en_cours: "En cours", traite: "Traité" };
export const REMONTEE_STATUS_STYLE: Record<RemonteeStatus, { bg: string; fg: string }> = {
  en_attente: { bg: "var(--track)", fg: "var(--slate)" },
  en_cours: { bg: "rgba(42,120,214,.16)", fg: "#2a78d6" },
  traite: { bg: "var(--good-bg)", fg: "var(--good)" },
};

/** Page d'où part la remontée : mémorisée à chaque changement de page par <RouteTracker />. */
export function previousPath(): string {
  try {
    return window.sessionStorage.getItem("linkee:prev") ?? "";
  } catch {
    return "";
  }
}

/** Envoie une pièce jointe dans <utilisateur>/<remontée>/ : les images sont compressées (1600 px, JPEG 80 %) pour
 * ménager le 1 Go de stockage, les PDF partent tels quels. Lance une erreur lisible si le fichier est refusé. */
export async function uploadRemonteeFile(supabase: SupabaseClient, uid: string, remonteeId: string, file: File): Promise<RemonteeAttachment> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isImage && !isPdf) throw new Error(`${file.name} : seuls les images et les PDF sont acceptés.`);
  const body: Blob = isImage ? await compressImage(file) : file;
  if (body.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} : fichier trop lourd (5 Mo maximum).`);
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "fichier";
  const name = isImage ? `${base}.jpg` : `${base}.pdf`;
  const path = `${uid}/${remonteeId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${name}`;
  const up = await supabase.storage.from("remontees").upload(path, body, { contentType: isImage ? "image/jpeg" : "application/pdf" });
  if (up.error) throw new Error(`${file.name} : ${up.error.message}`);
  return { path, name, size: body.size };
}

export async function openRemonteeFile(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from("remontees").createSignedUrl(path, 120);
  if (error || !data) throw new Error(error?.message ?? "Ouverture impossible");
  window.open(data.signedUrl, "_blank", "noopener");
}

export const fmtBytes = (b: number) => (b < 1024 ? `${b} o` : b < 1024 * 1024 ? `${Math.round(b / 1024)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`);

/** « Chrome sur Windows », « Safari sur iPhone (mobile) »… à partir du user-agent enregistré avec la remontée. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Inconnu";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur inconnu";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "système inconnu";
  const mobile = /Mobile|iPhone|Android/.test(ua) && !/iPad/.test(ua) ? " (mobile)" : "";
  return `${browser} sur ${os}${mobile}`;
}

/** Compteur du Superadmin : remontées jamais ouvertes ou avec une nouvelle réponse de l'utilisateur à relire. Désactivé
 * (0 requête) pour les autres rôles. */
export function useRemonteeAppBadge(enabled: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const load = () =>
      supabase
        .from("remontees")
        .select("id", { count: "exact", head: true })
        .is("super_seen_at", null)
        .then(({ count }) => {
          if (alive) setN(count ?? 0);
        });
    load();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || !alive) return;
      // chaque nouvelle remontée / réponse crée une notification pour le Superadmin : on s'en sert comme signal
      channel = supabase
        .channel("remontee-app-badge-" + data.user.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${data.user.id}` }, () => load())
        .subscribe();
    });
    const poll = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled]);
  return enabled ? n : 0;
}

/** Pastille rose de l'onglet « Remontées » : nombre de réponses / changements de statut non lus (notifications
 * de type "remontee"), rafraîchi en direct puis toutes les minutes. */
export function useRemonteeBadge(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const load = () =>
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "remontee")
        .is("read_at", null)
        .then(({ count }) => {
          if (alive) setN(count ?? 0);
        });
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || !alive) return;
      load();
      channel = supabase
        .channel("remontee-badge-" + data.user.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${data.user.id}` }, () => load())
        .subscribe();
    });
    const poll = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
  return n;
}
