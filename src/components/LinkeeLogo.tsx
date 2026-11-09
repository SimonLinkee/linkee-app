// Logo Linkee (mot + sourire) : version couleur sur fond clair, version claire sur fond sombre (menu, bandeaux marine).
// h = hauteur en pixels ; la largeur suit les proportions du logo.
export default function LinkeeLogo({ h = 28, light = false, className = "" }: { h?: number; light?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={light ? "/linkee-logo-clair.png" : "/linkee-logo.png"} alt="Linkee" height={h} width={Math.round((h * 720) / 290)} style={{ height: h, width: "auto" }} className={`block flex-none ${className}`} />
  );
}
