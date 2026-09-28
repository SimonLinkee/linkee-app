import { ImageResponse } from "next/og";

// App icon generated on the fly: navy background, cream "l" and the turquoise Linkee smile.
// /pwa-icon?size=192  ·  ?size=512&maskable=1 keeps the artwork inside the safe zone for round Android icons.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = Math.min(1024, Math.max(64, Number(searchParams.get("size")) || 512));
  const maskable = searchParams.get("maskable") === "1";
  const art = maskable ? 0.6 : 0.78; // share of the icon used by the drawing

  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#0A1A3F" }}>
        <svg width={size * art} height={size * art} viewBox="0 0 100 100">
          <rect x="42" y="8" width="16" height="58" rx="8" fill="#FDF4ED" />
          <path d="M14 64 C 32 96, 68 96, 86 64" stroke="#4FC1D6" strokeWidth="11" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
