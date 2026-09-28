import type { MetadataRoute } from "next";

// Makes Linkee installable on the phone home screen (Android: "Installer l'application", iPhone: "Sur l'écran d'accueil").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Linkee",
    short_name: "Linkee",
    description: "Entraide étudiante — logistique anti-gaspi à Lyon.",
    start_url: "/", // the app sends each person to their own space (admin, logisticien, partenaire)
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A1A3F",
    theme_color: "#0A1A3F",
    lang: "fr",
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
