export type AvatarKey = "pomme" | "tomate" | "fraise" | "carotte" | "brocoli" | "avocat" | "citron" | "aubergine";

const TEARDROP = "M50,24 C27,24 16,48 21,67 C26,88 38,95 50,95 C62,95 74,88 79,67 C84,48 73,24 50,24 Z";

export const AVATAR_DEFS: Record<AvatarKey, { bodyPath: string; bodyFill: string; extra: string; tint: string; label: string }> = {
  pomme: {
    bodyPath: TEARDROP,
    bodyFill: "#E4483A",
    extra:
      '<ellipse cx="60" cy="20" rx="7" ry="4" fill="#4CAF50" transform="rotate(20 60 20)"/><rect x="47" y="12" width="4" height="12" rx="2" fill="#6B4A2B"/>',
    tint: "#FBE2DE",
    label: "Pomme",
  },
  tomate: {
    bodyPath: "M50,30 A28,28 0 1 1 49.9,30 Z",
    bodyFill: "#E8503A",
    extra:
      '<path d="M50,10 L54,22 L64,18 L57,27 L67,30 L55,32 L60,42 L50,34 L40,42 L45,32 L33,30 L43,27 L36,18 L46,22 Z" fill="#4CAF50"/>',
    tint: "#FBE2DA",
    label: "Tomate",
  },
  fraise: {
    bodyPath: TEARDROP,
    bodyFill: "#EF4D6B",
    extra:
      '<path d="M50,26 L58,12 L52,24 L64,10 L55,26 L70,16 L57,29 L50,22 L43,29 L30,16 L45,26 L36,10 L48,24 L42,12 Z" fill="#4CAF50"/>' +
      '<circle cx="38" cy="52" r="1.6" fill="#FFD54F"/><circle cx="50" cy="46" r="1.6" fill="#FFD54F"/><circle cx="62" cy="52" r="1.6" fill="#FFD54F"/>' +
      '<circle cx="34" cy="70" r="1.6" fill="#FFD54F"/><circle cx="50" cy="76" r="1.6" fill="#FFD54F"/><circle cx="66" cy="70" r="1.6" fill="#FFD54F"/>',
    tint: "#FCE1E7",
    label: "Fraise",
  },
  carotte: {
    bodyPath: "M30,26 L70,26 L54,92 Q50,97 46,92 Z",
    bodyFill: "#F0932B",
    extra:
      '<path d="M40,26 Q34,8 28,4" stroke="#52A85C" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M50,26 Q50,4 50,0" stroke="#52A85C" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M60,26 Q66,8 72,4" stroke="#52A85C" stroke-width="3.4" fill="none" stroke-linecap="round"/>',
    tint: "#FCE8D2",
    label: "Carotte",
  },
  brocoli: {
    bodyPath:
      "M50,60 A14,14 0 1 1 50,59.9 Z M32,50 A12,12 0 1 1 32,49.9 Z M68,50 A12,12 0 1 1 68,49.9 Z M50,36 A13,13 0 1 1 50,35.9 Z M35,66 A11,11 0 1 1 35,65.9 Z M65,66 A11,11 0 1 1 65,65.9 Z",
    bodyFill: "#4C9A5B",
    extra: '<rect x="43" y="75" width="14" height="18" rx="4" fill="#C9E4B4"/>',
    tint: "#E1EFDA",
    label: "Brocoli",
  },
  avocat: { bodyPath: TEARDROP, bodyFill: "#3F6B2F", extra: "", tint: "#E4EBDA", label: "Avocat" },
  citron: {
    bodyPath: "M16,52 C16,38 30,26 50,26 C70,26 84,38 84,52 C84,66 70,78 50,78 C30,78 16,66 16,52 Z",
    bodyFill: "#F4D144",
    extra: '<path d="M14,52 L22,47 L22,57 Z" fill="#F4D144"/><path d="M86,52 L78,47 L78,57 Z" fill="#F4D144"/>',
    tint: "#FBF3D3",
    label: "Citron",
  },
  aubergine: {
    bodyPath: "M50,26 C30,26 22,50 26,68 C30,88 40,96 50,96 C60,96 70,88 74,68 C78,50 70,26 50,26 Z",
    bodyFill: "#5B3A73",
    extra: '<path d="M40,26 L60,26 L55,34 L45,34 Z" fill="#4CAF50"/><rect x="48" y="16" width="4" height="12" rx="2" fill="#4CAF50"/>',
    tint: "#E7DDEF",
    label: "Aubergine",
  },
};

export function critterSvg(key: AvatarKey) {
  const d = AVATAR_DEFS[key];
  return `<svg viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="${d.tint}"/>
    <path d="${d.bodyPath}" fill="${d.bodyFill}"/>
    ${d.extra}
    <path d="M28,64 Q12,56 16,38" stroke="#3A2A1A" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="16" cy="38" r="4.2" fill="#3A2A1A"/>
    <path d="M72,64 Q88,56 84,38" stroke="#3A2A1A" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="84" cy="38" r="4.2" fill="#3A2A1A"/>
    <circle cx="40" cy="47" r="7" fill="#fff"/><circle cx="60" cy="47" r="7" fill="#fff"/>
    <circle cx="42" cy="49" r="3.4" fill="#1A1A1A"/><circle cx="58" cy="49" r="3.4" fill="#1A1A1A"/>
    <circle cx="43.6" cy="47.2" r="1.2" fill="#fff"/><circle cx="59.6" cy="47.2" r="1.2" fill="#fff"/>
    <ellipse cx="30" cy="59" rx="5.2" ry="3.2" fill="#ff8fa3" opacity="0.4"/><ellipse cx="70" cy="59" rx="5.2" ry="3.2" fill="#ff8fa3" opacity="0.4"/>
    <path d="M40,61 Q50,69 60,61" stroke="#1A1A1A" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>`;
}
