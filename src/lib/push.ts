"use client";

// Notifications sur le téléphone (bannière + pastille) : abonnement du téléphone, enregistré côté serveur (/api/push/subscribe).
// Sur iPhone / iPad, cela ne marche que pour l'appli installée sur l'écran d'accueil (iOS 16.4 minimum).

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushState = {
  /** le navigateur sait recevoir des notifications */
  supported: boolean;
  /** le serveur est configuré (clés VAPID) */
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  /** iPhone / iPad : il faut d'abord installer l'appli sur l'écran d'accueil */
  needsInstall: boolean;
};

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function keyToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function pushState(): Promise<PushState> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const needsInstall = isIos() && !isStandalone();
  if (!supported) return { supported: false, configured: !!VAPID_PUBLIC, permission: "unsupported", subscribed: false, needsInstall };
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    subscribed = !!(await reg?.pushManager.getSubscription());
  } catch {
    /* ignoré */
  }
  return { supported, configured: !!VAPID_PUBLIC, permission: Notification.permission, subscribed, needsInstall };
}

async function send(sub: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return res.ok;
}

/** À appeler sur un clic : demande l'autorisation puis abonne ce téléphone. */
export async function enablePush(): Promise<{ ok: boolean; message?: string }> {
  if (!VAPID_PUBLIC) return { ok: false, message: "Les notifications téléphone ne sont pas encore configurées." };
  if (!("Notification" in window) || !("PushManager" in window)) return { ok: false, message: "Ce navigateur ne sait pas recevoir de notifications." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, message: perm === "denied" ? "Les notifications sont bloquées : autorise-les dans les réglages du téléphone pour Linkee." : "Autorisation non donnée." };
  const reg = await registration();
  if (!reg) return { ok: false, message: "Impossible d'activer (service worker indisponible)." };
  try {
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC) }));
    return (await send(sub)) ? { ok: true } : { ok: false, message: "Abonnement non enregistré : réessaie dans un instant." };
  } catch (e) {
    return { ok: false, message: "Activation impossible : " + (e as Error).message };
  }
}

/** À chaque ouverture de l'appli : si les notifications sont déjà autorisées, on remet l'abonnement à jour côté serveur. */
export async function syncPush(): Promise<void> {
  if (!VAPID_PUBLIC || !("Notification" in window) || Notification.permission !== "granted") return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await send(sub).catch(() => false);
}

/** Pastille sur l'icône de l'appli (nombre de notifications non lues) quand le navigateur sait l'afficher. */
export function setBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    /* non supporté */
  }
}
