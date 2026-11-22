import type { MetadataRoute } from "next";

// Makes Linkee installable on the phone home screen (Android: "Installer l'application", iPhone: "Sur l'écran d'accueil").
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Linkee",
    short_name: "Linkee",
    description: "Linkee — logistique anti-gaspi : collectes, distributions et suivi.",
    start_url: "/", // the app sends each person to their own space (admin, logisticien, partenaire)
    scope: "/",
    categories: ["productivity", "business"],
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A1A3F",
    theme_color: "#0A1A3F",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // appui long sur l'icône (Android) : accès direct à la journée du logisticien
    shortcuts: [{ name: "Ma journée", short_name: "Ma journée", url: "/journee", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] }],
  };
}
