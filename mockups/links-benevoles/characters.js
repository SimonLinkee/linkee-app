/* Links Bénévoles — PREVIEW ONLY. Personnages et accessoires dessinés en SVG (données fictives, aucune dépendance). */
'use strict';

const STAGES = [
  { name: 'Bébé', title: 'Padawan', from: 1, to: 9 },
  { name: 'Enfant', title: 'Apprenti Linker', from: 10, to: 19 },
  { name: 'Ado', title: 'Linker', from: 20, to: 29 },
  { name: 'Adulte mûr', title: 'Linker confirmé', from: 30, to: 39 },
  { name: 'Géant', title: 'Mentor', from: 40, to: 49 },
  { name: 'Légendaire', title: 'Ambassadeur', from: 50, to: 50 },
];
const stageOf = (lvl) => (lvl >= 50 ? 5 : Math.floor(lvl / 10));
const versionOf = (lvl) => Math.min(5, Math.floor(lvl / 10) + 1); // accessory version = stage of the level it was unlocked at
const SCALE = [0.78, 0.86, 0.94, 1.0, 1.1, 1.18];

const CATS = [
  { k: 'chapeau', n: 'Chapeau', e: '🎩' },
  { k: 'lunettes', n: 'Lunettes', e: '🕶️' },
  { k: 'haut', n: 'Haut', e: '👕' },
  { k: 'bas', n: 'Bas', e: '👖' },
  { k: 'chaussures', n: 'Chaussures', e: '👟' },
  { k: 'echarpe', n: 'Écharpe / cape', e: '🧣' },
  { k: 'sac', n: 'Sac', e: '👜' },
  { k: 'gants', n: 'Gants', e: '🧤' },
  { k: 'badge', n: 'Badge', e: '🏅' },
  { k: 'objet', n: 'Objet en main', e: '🪄' },
];

const STYLES = {
  cowboy: {
    n: 'Cowboy', e: '🤠', bg: 'linear-gradient(180deg,#ffd9a0 0%,#f7a56b 55%,#d98a4e 100%)',
    main: ['#c0392b', '#e9c96a', '#8b5a2b', '#6b4423', '#e8b923'], acc: ['#ffffff', '#8b5a2b', '#d9b26f', '#e8b923', '#fff3b0'],
    cloth: ['#c9a06a', '#b98a4a', '#9a6a2f', '#7a4f22', '#d9a92a'], pants: ['#7c9cc4', '#5b80b0', '#446a9c', '#33578a', '#e8b923'],
  },
  chef: {
    n: 'Chef cuisinier', e: '👨‍🍳', bg: 'repeating-conic-gradient(#fff8ec 0 25%,#f3e6d3 0 50%) 0 0/34px 34px',
    main: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#fffbe8'], acc: ['#4f6df5', '#90a4ae', '#2a3a8f', '#c62828', '#e8b923'],
    cloth: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#fffbe8'], pants: ['#e9eef5', '#d5dde8', '#c3cfdf', '#aebbd0', '#f0e3ad'],
  },
  magicien: {
    n: 'Magicien', e: '🧙', bg: 'radial-gradient(circle at 30% 20%,#5b3fa6 0%,#2a1a5e 60%,#150c33 100%)',
    main: ['#7b57c9', '#6a44b8', '#4f2f9a', '#3a2280', '#3a2280'], acc: ['#f6d55c', '#f6d55c', '#ffe27a', '#ffe27a', '#fff3b0'],
    cloth: ['#8a66d6', '#7650c4', '#5f3fae', '#4a2c94', '#3a2280'], pants: ['#6a4bb0', '#5a3da0', '#4b3190', '#3c2680', '#2f1c70'],
  },
};
const FUTURE_STYLES = [
  { n: 'Pirate', e: '🏴‍☠️' }, { n: 'Ninja', e: '🥷' }, { n: 'Astronaute', e: '👩‍🚀' }, { n: 'Jardinier', e: '🧑‍🌾' },
  { n: 'Super-héros', e: '🦸' }, { n: 'Robot / Cyber', e: '🤖' }, { n: 'Fée / Elfe', e: '🧚' },
];

// names of the 5 versions per category and style (hat names come from the brief)
const TIER = { m: ['classique', 'renforcé', 'de qualité', "d'élite", 'doré'], f: ['classique', 'renforcée', 'de qualité', "d'élite", 'dorée'] };
const NOUN = {
  cowboy: [null, ['Lunettes', 'f'], ['Gilet', 'm'], ['Jean', 'm'], ['Bottes', 'f'], ['Foulard', 'm'], ['Sacoche', 'f'], ['Gants', 'm'], ['Étoile de shérif', 'f'], ['Lasso', 'm']],
  chef: [null, ['Lunettes', 'f'], ['Veste', 'f'], ['Pantalon', 'm'], ['Sabots', 'm'], ['Torchon', 'm'], ['Panier', 'm'], ['Maniques', 'f'], ['Pin’s', 'm'], ['Ustensile', 'm']],
  magicien: [null, ['Lunettes', 'f'], ['Veste', 'f'], ['Pantalon', 'm'], ['Chaussons', 'm'], ['Cape', 'f'], ['Bourse', 'f'], ['Gants', 'm'], ['Médaillon', 'm'], ['Baguette', 'f']],
};
const HAT_NAMES = {
  cowboy: ['Bandana', 'Chapeau de paille', 'Stetson', 'Stetson shérif', 'Stetson doré'],
  chef: ['Bandana', 'Toque courte', 'Grande toque', 'Toque étoilée', 'Toque dorée 3 étoiles'],
  magicien: ['Bandeau étoilé', 'Petit chapeau pointu', 'Grand chapeau étoilé', 'Chapeau de mage', 'Chapeau astral doré'],
};
const OBJ_NAMES = {
  cowboy: ['Corde en pelote', 'Lasso', 'Lasso étoilé', 'Lasso de shérif', 'Lasso doré'],
  chef: ['Cuillère en bois', 'Fouet', 'Louche', 'Poêle', 'Cocotte dorée'],
  magicien: ['Bâton en bois', 'Baguette étoilée', 'Baguette scintillante', 'Sceptre de cristal', 'Sceptre doré'],
};
function itemName(style, cat, v) {
  if (cat === 0) return HAT_NAMES[style][v - 1];
  if (cat === 9) return OBJ_NAMES[style][v - 1];
  const [noun, g] = NOUN[style][cat];
  return noun + ' ' + TIER[g][v - 1];
}

/* ---------- characters ---------- */
const star = (x, y, r, fill, rot = 0) => {
  let p = '';
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90 + rot) * Math.PI) / 180, rr = i % 2 ? r * 0.45 : r;
    p += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ' ' + (y + Math.sin(a) * rr).toFixed(1);
  }
  return `<path d="${p}Z" fill="${fill}"/>`;
};
const sparkle = (x, y, r, fill = '#fff') => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="${fill}"/>`;

const CH = {
  fraise: {
    n: 'Fraise', e: '🍓', kind: 'fruit', cx: 100,
    tones: ['#ff9db0', '#ff8298', '#f2455e', '#e6304b', '#dc2140', '#ea1f45'], dark: '#b8163a',
    A: { headY: 52, hatW: 96, eyeY: 120, eyeDX: 25, neckY: 154, chest: [100, 170], waistY: 190, feetY: 216, feetDX: 22, hL: [44, 154], hR: [156, 154], bodyW: 112, gr: 220 },
    body: 'M100 66 C 44 64 36 128 62 176 C 78 206 92 216 100 216 C 108 216 122 206 138 176 C 164 128 156 64 100 66 Z',
    deco(st) {
      const seeds = [[76, 94], [124, 94], [100, 90], [52, 120], [148, 120], [60, 152], [140, 152], [84, 176], [116, 176], [100, 196], [100, 162]];
      const lf = ['#8fd68a', '#6cc76a', '#4fb752', '#3ea34a', '#2f9440', '#3aa54a'][st];
      const big = 1 + st * 0.06;
      let leaves = '';
      for (let i = 0; i < 6; i++) {
        const a = -90 + (i - 2.5) * 38;
        leaves += `<ellipse cx="100" cy="${66 - 16 * big}" rx="${9 * big}" ry="${24 * big}" fill="${lf}" transform="rotate(${a + 90} 100 66)"/>`;
      }
      return seeds.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4.2" fill="#ffe7a1" opacity=".9"/>`).join('') + leaves + `<circle cx="100" cy="64" r="7" fill="${lf}"/>`;
    },
  },
  banane: {
    n: 'Banane', e: '🍌', kind: 'fruit', cx: 100,
    tones: ['#fff2a8', '#ffe982', '#ffd93d', '#ffcd1c', '#ffc200', '#ffc700'], dark: '#d99a00',
    A: { headY: 50, hatW: 74, eyeY: 118, eyeDX: 16, neckY: 150, chest: [100, 168], waistY: 190, feetY: 214, feetDX: 14, hL: [60, 152], hR: [140, 152], bodyW: 80, gr: 218 },
    body: 'M100 52 C 128 54 141 94 139 140 C 137 182 122 212 100 216 C 78 212 63 182 61 140 C 59 94 72 54 100 52 Z',
    deco(st) {
      const br = ['#c08a4a', '#b07a3c', '#9b6a30', '#8a5a26', '#7a4c1e', '#8a5a26'][st];
      return `<path d="M124 70 C 134 100 134 150 122 196" fill="none" stroke="#e0a800" stroke-width="3" opacity=".45" stroke-linecap="round"/>
        <path d="M76 74 C 66 104 66 152 78 198" fill="none" stroke="#fff" stroke-width="3" opacity=".35" stroke-linecap="round"/>
        <rect x="93" y="30" width="14" height="24" rx="5" fill="${br}"/><rect x="90" y="26" width="20" height="9" rx="4" fill="#7a4c1e"/>
        <ellipse cx="100" cy="214" rx="10" ry="5" fill="#7a4c1e"/>`;
    },
  },
  carotte: {
    n: 'Carotte', e: '🥕', kind: 'legume', cx: 100,
    tones: ['#ffc78f', '#ffb06a', '#ff9536', '#ff8214', '#f56f00', '#ff7600'], dark: '#c85800',
    A: { headY: 70, hatW: 86, eyeY: 108, eyeDX: 20, neckY: 140, chest: [100, 154], waistY: 176, feetY: 220, feetDX: 12, hL: [58, 120], hR: [142, 120], bodyW: 90, gr: 224 },
    body: 'M58 92 C 58 66 142 66 142 92 C 142 132 118 196 100 222 C 82 196 58 132 58 92 Z',
    deco(st) {
      const lf = ['#8fd68a', '#6cc76a', '#4fb752', '#3ea34a', '#2f9440', '#3aa54a'][st];
      const s = 1 + st * 0.06;
      const leaf = (dx, ang, len) => `<path d="M100 76 C ${100 + dx * 0.4} ${76 - len * 0.5} ${100 + dx} ${76 - len * 0.8} ${100 + dx * 1.2} ${76 - len} C ${100 + dx * 0.2} ${76 - len * 0.7} 98 ${76 - len * 0.3} 100 76 Z" fill="${lf}" transform="rotate(${ang} 100 76)"/>`;
      return `<path d="M72 112 L88 112 M116 140 L130 140 M86 150 L96 150 M104 176 L114 176 M92 190 L98 190" stroke="${'#d96a00'}" stroke-width="3" stroke-linecap="round" opacity=".4"/>` +
        leaf(-26 * s, -18, 46 * s) + leaf(26 * s, 18, 46 * s) + leaf(0, 0, 56 * s);
    },
  },
  tomate: {
    n: 'Tomate', e: '🍅', kind: 'legume', cx: 100,
    tones: ['#ffb3a3', '#ff8f7a', '#f4553c', '#e83f26', '#d93016', '#e6341a'], dark: '#b02010',
    A: { headY: 82, hatW: 100, eyeY: 138, eyeDX: 27, neckY: 172, chest: [100, 182], waistY: 190, feetY: 206, feetDX: 24, hL: [36, 150], hR: [164, 150], bodyW: 128, gr: 210 },
    body: 'M100 86 C 158 78 174 130 162 170 C 152 200 126 208 100 208 C 74 208 48 200 38 170 C 26 130 42 78 100 86 Z',
    deco(st) {
      const lf = ['#8fd68a', '#6cc76a', '#4fb752', '#3ea34a', '#2f9440', '#3aa54a'][st];
      const s = 1 + st * 0.05;
      let leaves = '';
      for (let i = 0; i < 6; i++) leaves += `<path d="M100 84 C ${92} ${72 - 8 * s} ${88} ${64 - 12 * s} ${100} ${58 - 14 * s} C ${112} ${64 - 12 * s} ${108} ${72 - 8 * s} 100 84Z" fill="${lf}" transform="rotate(${i * 60 - 150} 100 84)"/>`;
      return leaves + `<circle cx="100" cy="82" r="7" fill="${lf}"/><rect x="97" y="58" width="6" height="14" rx="3" fill="#3e8a3a"/>`;
    },
  },
};
// silhouettes only (they exist later, shown as locked sketches)
const LOCKED = [
  ['Pomme', '🍎', 'round'], ['Cerise', '🍒', 'round'], ['Orange', '🍊', 'round'], ['Citron', '🍋', 'oval'], ['Kiwi', '🥝', 'oval'], ['Poire', '🍐', 'pear'], ['Pastèque', '🍉', 'oval'], ['Ananas', '🍍', 'tall'],
  ['Brocoli', '🥦', 'tree'], ['Aubergine', '🍆', 'tall'], ['Poivron', '🫑', 'round'], ['Radis', '🌱', 'pear'], ['Petit pois', '🟢', 'oval'], ['Potiron', '🎃', 'round'], ['Pomme de terre', '🥔', 'oval'], ['Poireau', '🧅', 'tall'],
];
function silhouette(shape, size = 84) {
  const shapes = {
    round: '<circle cx="50" cy="56" r="34"/>', oval: '<ellipse cx="50" cy="56" rx="26" ry="36"/>', pear: '<path d="M50 20 C 66 20 66 44 78 60 C 90 78 74 92 50 92 C 26 92 10 78 22 60 C 34 44 34 20 50 20Z"/>',
    tall: '<rect x="30" y="24" width="40" height="70" rx="20"/>', tree: '<circle cx="34" cy="44" r="18"/><circle cx="66" cy="44" r="18"/><circle cx="50" cy="32" r="18"/><rect x="42" y="56" width="16" height="36" rx="6"/>',
  };
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><g fill="#3a3560" opacity=".28">${shapes[shape]}<path d="M50 26 C 44 12 52 8 60 10 C 56 18 54 22 50 26Z"/></g><text x="50" y="66" text-anchor="middle" font-size="26" font-weight="800" fill="#fff" opacity=".7">?</text></svg>`;
}

/* ---------- face, body ---------- */
function face(c, st) {
  const A = c.A, cx = c.cx, r = [12, 10.5, 9.2, 8.6, 8.6, 8.8][st];
  const dx = A.eyeDX, ey = A.eyeY;
  const eye = (x) => `<ellipse cx="${x}" cy="${ey}" rx="${r * 0.86}" ry="${r}" fill="#2b1b2e"/><circle cx="${x + r * 0.3}" cy="${ey - r * 0.35}" r="${r * 0.36}" fill="#fff"/><circle cx="${x - r * 0.28}" cy="${ey + r * 0.35}" r="${r * 0.17}" fill="#fff" opacity=".9"/>`;
  const legend = st === 5 ? sparkle(cx - dx - 12, ey - 14, 5, '#fff7b0') + sparkle(cx + dx + 12, ey - 14, 5, '#fff7b0') : '';
  const mouth = st === 0 ? `<ellipse cx="${cx}" cy="${ey + 16}" rx="3.4" ry="4" fill="#7a2a3a"/>`
    : st < 3 ? `<path d="M${cx - 6} ${ey + 13} Q${cx} ${ey + 21} ${cx + 6} ${ey + 13}" fill="none" stroke="#7a2a3a" stroke-width="2.6" stroke-linecap="round"/>`
      : `<path d="M${cx - 9} ${ey + 12} Q${cx} ${ey + 26} ${cx + 9} ${ey + 12} Z" fill="#7a2a3a"/><path d="M${cx - 5} ${ey + 19} Q${cx} ${ey + 23} ${cx + 5} ${ey + 19}" fill="#ff8fa3"/>`;
  return `<g>${eye(cx - dx)}${eye(cx + dx)}
    <ellipse cx="${cx - dx - 14}" cy="${ey + 13}" rx="${st === 0 ? 9 : 7.5}" ry="${st === 0 ? 6 : 5}" fill="#ff6f9c" opacity=".55"/><ellipse cx="${cx + dx + 14}" cy="${ey + 13}" rx="${st === 0 ? 9 : 7.5}" ry="${st === 0 ? 6 : 5}" fill="#ff6f9c" opacity=".55"/>
    ${mouth}${legend}</g>`;
}

/* ---------- accessories ---------- */
function acc(cat, style, v, c) {
  const S = STYLES[style], A = c.A, cx = c.cx, m = S.main[v - 1], a = S.acc[v - 1], gold = v === 5, gd = '#e8b923', trim = gold ? gd : a, cloth = S.cloth[v - 1];
  const sp = (x, y, r = 4) => (gold ? sparkle(x, y, r, '#fff7b0') : '');
  switch (cat) {
    case 0: { // chapeau
      const x = cx, y = A.headY, w = A.hatW;
      if (style === 'cowboy') {
        if (v === 1) return `<g><path d="M${x - w * .47} ${y + 22} Q${x} ${y - 2} ${x + w * .47} ${y + 22} L${x + w * .47} ${y + 34} Q${x} ${y + 12} ${x - w * .47} ${y + 34}Z" fill="${m}"/>${[-.28, -.08, .12, .3].map((t, i) => `<circle cx="${x + w * t}" cy="${y + 19 + (i % 2) * 4}" r="2.4" fill="#fff"/>`).join('')}<path d="M${x + w * .44} ${y + 26} l 10 -4 l -2 12 z M${x + w * .44} ${y + 26} l 10 12 l -12 -2z" fill="${m}"/></g>`;
        if (v === 2) return `<g><ellipse cx="${x}" cy="${y + 16}" rx="${w * .7}" ry="${w * .13}" fill="#e6c25f"/><path d="M${x - w * .3} ${y + 16} Q${x - w * .34} ${y - w * .14} ${x} ${y - w * .16} Q${x + w * .34} ${y - w * .14} ${x + w * .3} ${y + 16}Z" fill="#f3d97f"/><rect x="${x - w * .3}" y="${y + 4}" width="${w * .6}" height="7" fill="#c0392b"/><path d="M${x - w * .5} ${y + 16} h ${w}" stroke="#d1a94a" stroke-width="2" opacity=".6"/></g>`;
        const col = v === 5 ? gd : v === 4 ? '#8b5a2b' : '#7a4a22', band = v === 5 ? '#a07510' : '#3f2612';
        return `<g><path d="M${x - w * .74} ${y + 10} Q${x - w * .5} ${y + 26} ${x} ${y + 20} Q${x + w * .5} ${y + 26} ${x + w * .74} ${y + 10} Q${x + w * .46} ${y + 6} ${x} ${y + 8} Q${x - w * .46} ${y + 6} ${x - w * .74} ${y + 10}Z" fill="${col}"/>
          <path d="M${x - w * .31} ${y + 10} Q${x - w * .34} ${y - w * .22} ${x - w * .1} ${y - w * .17} Q${x} ${y - w * .08} ${x + w * .1} ${y - w * .17} Q${x + w * .34} ${y - w * .22} ${x + w * .31} ${y + 10}Z" fill="${col}"/>
          <rect x="${x - w * .31}" y="${y + 1}" width="${w * .62}" height="7" fill="${band}"/>${v >= 4 ? star(x, y + 4.5, 7, v === 5 ? '#fff3b0' : gd) : `<rect x="${x - 4}" y="${y + 1}" width="8" height="7" rx="1.5" fill="#d9b26f"/>`}${sp(x - w * .5, y - 4, 5)}${sp(x + w * .52, y + 6, 4)}</g>`;
      }
      if (style === 'chef') {
        if (v === 1) return `<g><path d="M${x - w * .47} ${y + 22} Q${x} ${y - 2} ${x + w * .47} ${y + 22} L${x + w * .47} ${y + 34} Q${x} ${y + 12} ${x - w * .47} ${y + 34}Z" fill="#fff" stroke="#dfe6ee"/>${[-.28, -.08, .12, .3].map((t, i) => `<rect x="${x + w * t - 3}" y="${y + 16 + (i % 2) * 4}" width="6" height="6" fill="${a}" opacity=".8"/>`).join('')}</g>`;
        const h = v === 2 ? w * .3 : w * .52;
        const puff = v >= 3 ? `<circle cx="${x - w * .2}" cy="${y - h + 6}" r="${w * .2}" fill="#fff" stroke="#e3e9f0"/><circle cx="${x + w * .2}" cy="${y - h + 6}" r="${w * .2}" fill="#fff" stroke="#e3e9f0"/><circle cx="${x}" cy="${y - h - 2}" r="${w * .24}" fill="#fff" stroke="#e3e9f0"/>` : `<ellipse cx="${x}" cy="${y - h + 4}" rx="${w * .34}" ry="${w * .14}" fill="#fff" stroke="#e3e9f0"/>`;
        const stars = v === 4 ? star(x, y - h * .35, 6, '#c62828') : v === 5 ? star(x - 14, y - h * .35, 5, gd) + star(x, y - h * .5, 6, gd) + star(x + 14, y - h * .35, 5, gd) : '';
        return `<g>${puff}<path d="M${x - w * .3} ${y + 14} L${x - w * .32} ${y - h + 8} L${x + w * .32} ${y - h + 8} L${x + w * .3} ${y + 14}Z" fill="#fff" stroke="#e3e9f0"/><path d="M${x - w * .12} ${y + 12} V${y - h + 12} M${x + w * .12} ${y + 12} V${y - h + 12}" stroke="#e3e9f0"/>
          <rect x="${x - w * .3}" y="${y + 4}" width="${w * .6}" height="10" rx="2" fill="${v === 5 ? gd : v >= 3 ? a : '#dfe6ee'}"/>${stars}${sp(x + w * .38, y - h, 5)}</g>`;
      }
      // magicien
      if (v === 1) return `<g><path d="M${x - w * .5} ${y + 24} Q${x} ${y - 2} ${x + w * .5} ${y + 24} L${x + w * .5} ${y + 34} Q${x} ${y + 10} ${x - w * .5} ${y + 34}Z" fill="${m}"/>${star(x, y + 15, 8, a)}</g>`;
      const hh = [0, 0, w * .62, w * .95, w * 1.1, w * 1.25][v - 1] || w * .5;
      const hc = v === 5 ? '#3a2280' : m;
      return `<g><ellipse cx="${x}" cy="${y + 14}" rx="${w * .62}" ry="${w * .12}" fill="${v === 5 ? '#2b1868' : hc}"/>
        <path d="M${x - w * .36} ${y + 14} Q${x - w * .3} ${y - hh * .5} ${x + w * .05 + v * 2} ${y - hh} Q${x + w * .3} ${y - hh * .45} ${x + w * .36} ${y + 14}Z" fill="${hc}"/>
        <path d="M${x - w * .36} ${y + 14} Q${x} ${y + 20} ${x + w * .36} ${y + 14} L${x + w * .35} ${y + 5} Q${x} ${y + 12} ${x - w * .35} ${y + 5}Z" fill="${v >= 4 ? gd : a}"/>
        ${star(x - w * .12, y - hh * .35, 5, a)}${star(x + w * .14, y - hh * .1, 4, a)}${v >= 4 ? `<path d="M${x + 4} ${y - hh * .62} a 9 9 0 1 0 8 12 a 7 7 0 1 1 -8 -12z" fill="${gd}"/>` : ''}${sp(x + w * .1, y - hh - 4, 6)}${sp(x - w * .45, y - 4, 5)}</g>`;
    }
    case 1: { // lunettes
      const y = A.eyeY, dx = A.eyeDX, r = 15, rim = v === 5 ? gd : style === 'cowboy' ? '#3a2612' : style === 'chef' ? (v === 1 ? '#b8c4d2' : a) : a;
      const lens = style === 'cowboy' ? '#222' : style === 'chef' ? '#bfe9ff' : '#c9a8ff', op = style === 'cowboy' ? 0.6 : 0.4;
      const shape = ['round', 'square', 'round', 'star', 'round'][v - 1];
      const one = (x) => shape === 'star' ? `<g>${star(x, y, r + 3, rim)}${star(x, y, r - 2, lens)}</g>`.replace(/<path/g, '<path') : shape === 'square' ? `<rect x="${x - r}" y="${y - r + 3}" width="${r * 2}" height="${r * 1.6}" rx="5" fill="${lens}" fill-opacity="${op}" stroke="${rim}" stroke-width="3"/>` : `<circle cx="${x}" cy="${y}" r="${r}" fill="${lens}" fill-opacity="${op}" stroke="${rim}" stroke-width="${v === 3 ? 4.5 : 3}"/>`;
      if (style === 'magicien' && v === 1) return `<g><circle cx="${c.cx + dx}" cy="${y}" r="${r}" fill="#fff" fill-opacity=".25" stroke="${gd}" stroke-width="3"/><path d="M${c.cx + dx + r} ${y + 4} Q${c.cx + dx + r + 16} ${y + 34} ${c.cx + dx + 8} ${y + 52}" fill="none" stroke="${gd}" stroke-width="1.6"/></g>`;
      return `<g>${one(c.cx - dx)}${one(c.cx + dx)}<path d="M${c.cx - dx + r} ${y} Q${c.cx} ${y - 5} ${c.cx + dx - r} ${y}" fill="none" stroke="${rim}" stroke-width="3"/>${sp(c.cx + dx + r, y - r, 5)}</g>`;
    }
    case 2: { // haut (clipped to body)
      const y0 = A.neckY, y1 = A.waistY, bw = A.bodyW;
      if (style === 'cowboy') return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${cloth}"/><path d="M${cx} ${y0} L${cx - 14} ${y1} M${cx} ${y0} L${cx + 14} ${y1}" stroke="${v >= 4 ? gd : '#5c3b1a'}" stroke-width="3"/><path d="M${cx - 14} ${y0} L${cx} ${y0 + 28} L${cx + 14} ${y0}" fill="#f6dfc0"/>${[0, 1, 2].map((i) => `<circle cx="${cx + (i % 2 ? 5 : -5)}" cy="${y0 + 10 + i * 9}" r="2.4" fill="${v >= 3 ? gd : '#e8d3a0'}"/>`).join('')}<rect x="0" y="${y0}" width="200" height="4" fill="${v >= 3 ? trim : '#8b5a2b'}" opacity=".7"/></g>`;
      if (style === 'chef') return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="#fff"/><rect x="0" y="${y0}" width="200" height="4" fill="${v >= 3 ? a : '#dfe6ee'}"/><path d="M${cx} ${y0} V${y1}" stroke="#dfe6ee" stroke-width="2"/>${[0, 1, 2].map((i) => `<circle cx="${cx - 9}" cy="${y0 + 10 + i * 9}" r="2.6" fill="${v === 5 ? gd : v >= 3 ? a : '#b8c4d2'}"/><circle cx="${cx + 9}" cy="${y0 + 10 + i * 9}" r="2.6" fill="${v === 5 ? gd : v >= 3 ? a : '#b8c4d2'}"/>`).join('')}</g>`;
      return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${cloth}"/><rect x="0" y="${y0}" width="200" height="4" fill="${v >= 3 ? gd : a}"/><path d="M${cx} ${y0} V${y1}" stroke="${a}" stroke-width="2"/>${[[-26, 12], [24, 20], [-8, 28], [14, 8]].map(([dx, dy]) => star(cx + dx, y0 + dy, 4.2, a)).join('')}${v === 5 ? sparkle(cx + 30, y0 + 26, 5, '#fff7b0') : ''}</g>`;
    }
    case 3: { // bas (clipped)
      const y0 = A.waistY, y1 = A.gr + 6;
      const base = S.pants[v - 1];
      const belt = style === 'cowboy' ? `<rect x="0" y="${y0}" width="200" height="6" fill="#4a2c12"/><rect x="${cx - 6}" y="${y0 - 1}" width="12" height="8" rx="2" fill="${v >= 3 ? gd : '#d9b26f'}"/>` : `<rect x="0" y="${y0}" width="200" height="5" fill="${style === 'chef' ? a : gd}" opacity=".85"/>`;
      const pat = style === 'chef' ? Array.from({ length: 8 }, (_, i) => `<rect x="${44 + i * 16}" y="${y0 + 6}" width="8" height="${y1 - y0}" fill="${v >= 3 ? a : '#b8c4d2'}" opacity=".35"/>`).join('') : style === 'magicien' ? [[-30, 14], [24, 10], [-6, 20]].map(([dx, dy]) => star(cx + dx, y0 + dy + 6, 3.4, a)).join('') : `<path d="M${cx} ${y0 + 6} V${y1}" stroke="#2e4a75" stroke-width="2" opacity=".5"/>`;
      return `<g clip-path="url(#clip)"><rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${base}"/>${pat}${belt}</g>`;
    }
    case 4: { // chaussures
      const y = A.feetY, dx = A.feetDX;
      const shoe = (x, dir) => {
        if (style === 'cowboy') return `<g><path d="M${x - 12} ${y - 10} h 16 v 8 h 8 q 4 0 4 5 v 4 h -30 z" fill="${v === 5 ? gd : '#7a4a22'}"/><rect x="${x - 14}" y="${y + 4}" width="7" height="5" fill="#3f2612"/><path d="M${x - 12} ${y - 10} h 16" stroke="${v >= 3 ? gd : '#5c3b1a'}" stroke-width="3"/>${v >= 3 ? `<circle cx="${x - 16}" cy="${y + 8}" r="3" fill="${gd}"/>` : ''}</g>`;
        if (style === 'chef') return `<g><path d="M${x - 15} ${y - 4} q 0 -8 10 -8 h 12 q 8 0 8 8 v 8 h -30 z" fill="#fff" stroke="#c9d3df"/><rect x="${x - 15}" y="${y + 4}" width="30" height="5" rx="2" fill="${v >= 3 ? a : '#90a4ae'}"/>${v === 5 ? sparkle(x + 10, y - 8, 4, '#fff7b0') : ''}</g>`;
        return `<g><path d="M${x - 14} ${y - 4} q 0 -8 10 -8 h 10 q 10 0 14 -10 q 8 8 -2 24 h -32 z" fill="${S.main[v - 1]}"/><rect x="${x - 14}" y="${y + 6}" width="32" height="4" rx="2" fill="${a}"/>${star(x + 12, y - 16, 4, a)}</g>`;
      };
      return `<g>${shoe(c.cx - dx, -1)}${shoe(c.cx + dx, 1)}</g>`;
    }
    case 5: { // écharpe / cape
      const y = A.neckY, w = A.bodyW * .5;
      if (style === 'magicien') return { behind: `<path d="M${cx - w - 6} ${y - 8} Q${cx - w - 30} ${A.gr - 30} ${cx - w - 16} ${A.gr + 4} L${cx + w + 16} ${A.gr + 4} Q${cx + w + 30} ${A.gr - 30} ${cx + w + 6} ${y - 8}Z" fill="${v >= 3 ? '#3a2280' : m}"/><path d="M${cx - w - 10} ${A.gr - 4} L${cx + w + 10} ${A.gr - 4}" stroke="${trim}" stroke-width="4"/>${v >= 2 ? star(cx - w - 8, A.gr - 40, 4, a) + star(cx + w + 6, A.gr - 60, 4, a) : ''}<path d="M${cx - w - 6} ${y - 8} Q${cx - w - 30} ${A.gr - 30} ${cx - w - 16} ${A.gr + 4} L${cx - w + 8} ${A.gr + 4} Q${cx - w - 12} ${A.gr - 30} ${cx - w + 2} ${y - 8}Z" fill="#c62828" opacity=".6"/>` };
      if (style === 'cowboy') return `<g><path d="M${cx - w * .7} ${y - 2} Q${cx} ${y + 16} ${cx + w * .7} ${y - 2} L${cx + 8} ${y + 34} Q${cx} ${y + 44} ${cx - 8} ${y + 34}Z" fill="${v === 1 ? '#c0392b' : v === 5 ? gd : v === 4 ? '#e0a52a' : v === 3 ? '#b5651d' : '#d9534f'}"/>${[-12, 0, 12].map((d) => `<circle cx="${cx + d}" cy="${y + 12 + Math.abs(d) * -.1}" r="2" fill="#fff" opacity=".8"/>`).join('')}${sp(cx + w * .7, y, 4)}</g>`;
      return `<g><path d="M${cx - w * .75} ${y - 3} Q${cx} ${y + 13} ${cx + w * .75} ${y - 3} L${cx + w * .75} ${y + 7} Q${cx} ${y + 23} ${cx - w * .75} ${y + 7}Z" fill="#fff" stroke="#dfe6ee"/><path d="M${cx + w * .45} ${y + 10} l 6 26 h 12 l -2 -26z" fill="#fff" stroke="#dfe6ee"/><rect x="${cx + w * .45}" y="${y + 30}" width="16" height="4" fill="${v >= 3 ? a : '#90a4ae'}"/>${sp(cx - w * .7, y, 4)}</g>`;
    }
    case 6: { // sac
      const x = cx - A.bodyW * .5 - 6, y = A.waistY - 4;
      const body = style === 'cowboy' ? `<rect x="${x - 15}" y="${y}" width="30" height="26" rx="5" fill="${v === 5 ? gd : '#8b5a2b'}"/><path d="M${x - 15} ${y + 8} h 30" stroke="#4a2c12" stroke-width="3"/><circle cx="${x}" cy="${y + 12}" r="3" fill="${v >= 3 ? gd : '#d9b26f'}"/>`
        : style === 'chef' ? `<path d="M${x - 16} ${y + 6} h 32 l -4 20 h -24z" fill="#d9a85c" stroke="#a97c34"/><path d="M${x - 10} ${y + 6} q 10 -18 20 0" fill="none" stroke="#a97c34" stroke-width="3"/><path d="M${x - 8} ${y + 10} l -4 14 M${x} ${y + 10} v 14 M${x + 8} ${y + 10} l 4 14" stroke="#c99347" stroke-width="2"/>`
          : `<path d="M${x - 14} ${y + 10} q 0 -6 14 -6 q 14 0 14 6 l -4 16 h -20z" fill="${m}"/><path d="M${x - 14} ${y + 10} q 14 -4 28 0" stroke="${gd}" stroke-width="3" fill="none"/>${star(x, y + 18, 5, a)}`;
      return `<g><path d="M${cx + A.bodyW * .3} ${A.neckY - 6} L${x + 6} ${y}" stroke="${style === 'cowboy' ? '#5c3b1a' : style === 'chef' ? '#a97c34' : gd}" stroke-width="4" clip-path="url(#clip)"/>${body}${sp(x + 14, y, 4)}</g>`;
    }
    case 7: { // gants
      const g = (p, dir) => {
        const [x, y] = p;
        if (style === 'cowboy') return `<g><circle cx="${x}" cy="${y}" r="11" fill="${v === 5 ? gd : '#7a4a22'}"/><rect x="${x - 12 * -dir - 8}" y="${y - 3}" width="16" height="7" rx="3" fill="${v >= 3 ? gd : '#4a2c12'}" transform="rotate(${dir * 25} ${x} ${y})"/></g>`;
        if (style === 'chef') return `<g><circle cx="${x}" cy="${y}" r="12" fill="${v >= 4 ? '#c62828' : '#f5f5f5'}" stroke="#d5dde8"/><path d="M${x - 8} ${y - 4} h 16 M${x - 8} ${y + 2} h 16" stroke="${a}" stroke-width="2" opacity=".7"/></g>`;
        return `<g><circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="#d8d0f0"/><rect x="${x - 9}" y="${y + 6}" width="18" height="6" rx="3" fill="${gd}"/>${v >= 4 ? star(x, y - 2, 4, gd) : ''}</g>`;
      };
      return `<g>${g(A.hL, -1)}${g(A.hR, 1)}</g>`;
    }
    case 8: { // badge
      const x = cx + A.bodyW * .3, y = A.chest[1] - 8, R = 9 + v;
      if (style === 'cowboy') return `<g>${star(x, y, R + 4, v === 5 ? gd : '#d9b26f')}${star(x, y, R, gd)}<circle cx="${x}" cy="${y}" r="2.4" fill="#fff3b0"/></g>`;
      if (style === 'chef') return `<g><circle cx="${x}" cy="${y}" r="${R}" fill="#fff" stroke="${v === 5 ? gd : a}" stroke-width="3"/><path d="M${x - 5} ${y + 4} v -4 q -4 -6 3 -7 q 2 -4 4 0 q 7 1 3 7 v 4z" fill="#dfe6ee"/></g>`;
      return `<g><circle cx="${x}" cy="${y}" r="${R}" fill="${m}" stroke="${gd}" stroke-width="3"/><path d="M${x + 1} ${y - 6} a 6 6 0 1 0 5 8 a 5 5 0 1 1 -5 -8z" fill="${a}"/></g>`;
    }
    default: { // objet en main
      const [x, y] = A.hR;
      if (style === 'cowboy') {
        const rope = v === 5 ? gd : '#c9a45c';
        return `<g><ellipse cx="${x + 12}" cy="${y + 6}" rx="${v === 1 ? 10 : 18}" ry="${v === 1 ? 8 : 14}" fill="none" stroke="${rope}" stroke-width="4"/>${v > 1 ? `<ellipse cx="${x + 12}" cy="${y + 6}" rx="${v === 1 ? 6 : 12}" ry="${v === 1 ? 4 : 8}" fill="none" stroke="${rope}" stroke-width="2" opacity=".6"/>` : ''}${v >= 3 ? star(x + 28, y - 14, 6, gd) : ''}${sp(x + 30, y + 16, 5)}<circle cx="${x}" cy="${y}" r="6" fill="#7a4a22"/></g>`;
      }
      if (style === 'chef') {
        const w = ['<rect x="-3" y="-30" width="6" height="34" rx="3" fill="#b9814a"/><ellipse cx="0" cy="-34" rx="9" ry="7" fill="#c99358"/>', '<rect x="-2" y="-14" width="4" height="20" rx="2" fill="#90a4ae"/><path d="M-8 -14 q 8 -22 16 0 M-4 -14 q 4 -20 8 0" fill="none" stroke="#b8c4d2" stroke-width="2"/>', '<rect x="-2" y="-16" width="4" height="22" rx="2" fill="#90a4ae"/><ellipse cx="0" cy="-22" rx="10" ry="8" fill="#b8c4d2" stroke="#8fa0b3" stroke-width="2"/>', '<circle cx="0" cy="-22" r="15" fill="#3a3f4b"/><circle cx="0" cy="-22" r="10" fill="#4a5060"/><rect x="10" y="-25" width="26" height="6" rx="3" fill="#3a3f4b"/>', '<rect x="-16" y="-30" width="32" height="24" rx="8" fill="#e8b923"/><rect x="-18" y="-34" width="36" height="8" rx="4" fill="#f5d55c"/><circle cx="0" cy="-38" r="4" fill="#e8b923"/>'][v - 1];
        return `<g transform="translate(${x + 8} ${y + 4}) rotate(14)">${w}${v === 5 ? sparkle(14, -36, 5, '#fff7b0') + sparkle(-16, -20, 4, '#fff7b0') : ''}</g>`;
      }
      const tip = v === 1 ? '' : v === 2 ? star(0, -44, 8, a) : v === 3 ? star(0, -44, 8, a) + sparkle(-12, -52, 5, '#fff') + sparkle(12, -34, 4, '#fff') : `<circle cx="0" cy="-46" r="${v === 5 ? 11 : 9}" fill="${v === 5 ? '#ffe27a' : '#8fd0ff'}"/><circle cx="-3" cy="-49" r="3" fill="#fff" opacity=".8"/>`;
      return `<g transform="translate(${x + 8} ${y + 2}) rotate(16)"><rect x="-3" y="-40" width="6" height="52" rx="3" fill="${v >= 4 ? (v === 5 ? gd : '#5c3b1a') : '#7a4a22'}"/>${tip}${v === 5 ? sparkle(16, -56, 5, '#fff7b0') + sparkle(-16, -40, 4, '#fff7b0') : ''}</g>`;
    }
  }
}

/* ---------- full character ---------- */
let UID = 0;
/**
 * opts: { stage 0-5, outfit: {cat:{style,v}} , aura:boolean, style (theme of the full-set aura), hue, size }
 */
function characterSVG(ck, opts = {}) {
  const c = CH[ck], st = opts.stage ?? 0, A = c.A, uid = 'c' + ++UID, tone = c.tones[st];
  const outfit = opts.outfit || {};
  const k = opts.noScale ? 1 : SCALE[st], gr = A.gr;
  const parts = { behind: '', front: '' };
  const layers = [];
  for (let cat = 0; cat < 10; cat++) {
    const it = outfit[cat];
    if (!it) { layers[cat] = ''; continue; }
    const r = acc(cat, it.style, it.v, c);
    if (r && typeof r === 'object') { parts.behind += r.behind; layers[cat] = ''; } else layers[cat] = r;
  }
  const aura = st === 5 ? `<g class="aura"><circle cx="100" cy="130" r="118" fill="url(#gl${uid})"/><g class="rays" style="transform-origin:100px 130px">${Array.from({ length: 12 }, (_, i) => `<path d="M100 130 L${100 - 8} 6 L${100 + 8} 6Z" fill="#ffe27a" opacity=".35" transform="rotate(${i * 30} 100 130)"/>`).join('')}</g></g>` : '';
  const fullAura = opts.aura ? `<g class="aura2"><circle cx="100" cy="130" r="112" fill="none" stroke="${opts.auraColor || '#ffe27a'}" stroke-width="5" opacity=".7" stroke-dasharray="10 8"/><circle cx="100" cy="130" r="100" fill="url(#fa${uid})"/></g>` : '';
  const sparkles = st >= 4 ? sparkle(30, 70, 7, '#fff7b0') + sparkle(172, 96, 6, '#fff') + sparkle(160, 40, 5, '#fff7b0') + (st === 5 ? sparkle(40, 180, 6, '#fff7b0') : '') : '';
  const gloss = st >= 3 ? `<ellipse cx="${c.cx - A.bodyW * .26}" cy="${A.headY + 46}" rx="9" ry="22" fill="#fff" opacity="${st >= 4 ? 0.5 : 0.35}" transform="rotate(18 ${c.cx - A.bodyW * .26} ${A.headY + 46})"/>` : '';
  const hue = opts.hue ? `style="filter:hue-rotate(${opts.hue}deg)"` : '';
  const size = opts.size || 160;
  return `<svg class="char" viewBox="-10 -56 220 296" width="${size}" height="${size * 1.345}" role="img" aria-label="${c.n} — ${STAGES[st].name}" ${hue}>
    <defs><clipPath id="clip${uid}"><path d="${c.body}"/></clipPath>
      <radialGradient id="gl${uid}"><stop offset="0" stop-color="#fff7b0" stop-opacity=".9"/><stop offset=".6" stop-color="#ffd76b" stop-opacity=".35"/><stop offset="1" stop-color="#ffd76b" stop-opacity="0"/></radialGradient>
      <radialGradient id="fa${uid}"><stop offset=".55" stop-color="${opts.auraColor || '#ffe27a'}" stop-opacity="0"/><stop offset="1" stop-color="${opts.auraColor || '#ffe27a'}" stop-opacity=".45"/></radialGradient></defs>
    ${aura}${fullAura}
    <ellipse cx="100" cy="${gr + 4}" rx="${60 * k}" ry="7" fill="#000" opacity=".12"/>
    <g transform="translate(100 ${gr}) scale(${k}) translate(-100 -${gr})">
      ${parts.behind}
      <ellipse cx="${A.hL[0] + 6}" cy="${A.hL[1]}" rx="9" ry="13" fill="${tone}" stroke="${c.dark}" stroke-opacity=".4" stroke-width="2" transform="rotate(30 ${A.hL[0] + 6} ${A.hL[1]})"/>
      <ellipse cx="${A.hR[0] - 6}" cy="${A.hR[1]}" rx="9" ry="13" fill="${tone}" stroke="${c.dark}" stroke-opacity=".4" stroke-width="2" transform="rotate(-30 ${A.hR[0] - 6} ${A.hR[1]})"/>
      <ellipse cx="${c.cx - A.feetDX}" cy="${A.feetY + 1}" rx="13" ry="7" fill="${c.dark}"/><ellipse cx="${c.cx + A.feetDX}" cy="${A.feetY + 1}" rx="13" ry="7" fill="${c.dark}"/>
      <path d="${c.body}" fill="${tone}" stroke="${c.dark}" stroke-opacity=".35" stroke-width="2.5"/>
      ${c.deco(st)}${gloss}
      <g clip-path="url(#clip${uid})">${layers[2] ? layers[2].replace('url(#clip)', 'url(#clip' + uid + ')') : ''}${layers[3] ? layers[3].replace('url(#clip)', 'url(#clip' + uid + ')') : ''}${layers[6] && layers[6].includes('clip-path') ? '' : ''}</g>
      ${layers[4] || ''}${layers[5] || ''}${layers[6] ? layers[6].replace('url(#clip)', 'url(#clip' + uid + ')') : ''}${layers[8] || ''}
      ${face(c, st)}${layers[1] || ''}${layers[0] || ''}${layers[7] || ''}${layers[9] || ''}
    </g>${sparkles}</svg>`;
}
