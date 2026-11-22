import type { NextConfig } from "next";

// En-têtes de sécurité de base (pas de CSP stricte : l'appli charge des sources externes variées — Supabase,
// Google Fonts, l'API adresse gouvernementale, le calcul d'itinéraire — une CSP mal calibrée casserait ces
// intégrations sans qu'on puisse la tester en conditions réelles ici).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // le service worker ne doit jamais être gardé en cache par le navigateur : une nouvelle version s'applique tout de suite
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
