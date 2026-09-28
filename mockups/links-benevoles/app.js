/* Links Bénévoles — PREVIEW ONLY : maquette cliquable, données fictives en dur. Aucune base de données, aucun code de l'appli existante. */
'use strict';

const WALK_TITLES = ['Petit marcheur', 'Marcheur', 'Grand marcheur', 'Randonneur', 'Cycliste du dimanche', 'Cycliste', 'Grand cycliste', 'Coursier', 'Pédaleur fou', 'Tour de France'];
const CAR_TITLES = [[10, 'Drive'], [20, 'Super Driver'], [30, 'Roi de la route'], [40, 'Pilote de rallye'], [50, 'Fou du volant']];
const typology = (mode, r) => (mode === 'walk' ? { t: WALK_TITLES[Math.min(10, Math.max(1, r)) - 1], e: r <= 4 ? '🚶' : '🚲' } : { t: (CAR_TITLES.find(([m]) => r <= m) || CAR_TITLES[4])[1], e: '🚗' });

const ASSOS = {
  a1: { n: 'Maison des étudiants', addr: "12 rue de l'Université, 69007 Lyon", tel: '04 72 00 11 22', open: '09:00–19:30' },
  a2: { n: 'Restos du Cœur Guillotière', addr: '5 cours Gambetta, 69003 Lyon', tel: '04 78 00 33 44', open: '10:00–18:30' },
  a3: { n: 'Épicerie solidaire Gerland', addr: '48 avenue Jean Jaurès, 69007 Lyon', tel: '04 78 00 55 66', open: '14:00–20:00' },
  a4: { n: 'Croix-Rouge Lyon 3e', addr: '22 rue Paul Bert, 69003 Lyon', tel: '04 72 00 77 88', open: '09:00–19:00' },
};
const LINKS = [
  { id: 'l1', p: 'Boulangerie Ange', pa: '18 rue Victor Hugo, 69002', win: '17:30 – 19:00', kg: 8, fresh: false, modes: ['walk', 'car'], dist: 0.8, trip: 1.2, asso: 'a1', x: 118, y: 178 },
  { id: 'l2', p: 'Monoprix Bellecour', pa: '4 place Bellecour, 69002', win: '18:00 – 19:30', kg: 21, fresh: true, modes: ['walk', 'car'], dist: 1.9, trip: 2.3, asso: 'a2', x: 250, y: 128 },
  { id: 'l3', p: 'Carrefour City Part-Dieu', pa: '2 rue Garibaldi, 69003', win: '17:45 – 19:15', kg: 62, fresh: false, modes: ['car'], dist: 4.6, trip: 4.8, asso: 'a3', x: 300, y: 300 },
  { id: 'l4', p: 'Traiteur Saveurs', pa: '31 cours Vitton, 69006', win: '18:15 – 19:45', kg: 14, fresh: true, modes: ['walk', 'car'], dist: 3.1, trip: 1.6, asso: 'a4', x: 88, y: 296 },
  { id: 'l5', p: 'Marché Croix-Rousse', pa: 'boulevard de la Croix-Rousse, 69004', win: '17:30 – 19:00', kg: 18, fresh: false, modes: ['walk'], dist: 7.5, trip: 2.9, asso: 'a1', x: 196, y: 50 },
];
const linkIcon = (l, mode) => (l.fresh ? '🧊' : mode === 'car' && l.kg > 25 ? '🚗' : '🎒');
const SHOP = {
  emoji: [['⭐', 'Étoile', 40], ['🚀', 'Fusée', 60], ['🌈', 'Arc-en-ciel', 80], ['🔥', 'Flamme', 80], ['🍀', 'Trèfle', 50]],
  bg: [['prairie', 'Prairie', 'linear-gradient(180deg,#c8f0ff,#b8ec9a)', 90], ['ville', 'Ville du soir', 'linear-gradient(180deg,#ffb88a,#6b5bd6)', 120], ['bonbon', 'Bonbon', 'linear-gradient(135deg,#ffc2e2,#c9b8ff)', 100], ['nuit', 'Nuit étoilée', 'radial-gradient(circle at 30% 20%,#3b3a8f,#0c0c2e)', 140]],
  color: [[0, 'Couleur d’origine', 0], [45, 'Soleil', 60], [-40, 'Bonbon', 60], [190, 'Glace', 80], [110, 'Menthe', 80]],
};

const S = {
  role: 'linker', screen: 'intro', slide: 0, char: 'fraise', level: 1, style: 'cowboy', chosen: {}, equipped: {}, points: 260, name: 'Léa',
  xp: 30, mode: 'walk', radius: 4, cold: true, slots: { 1: { 2: 1 }, 3: { 2: 1 } }, addr: '14 rue de la République, 69002 Lyon',
  gone: {}, linkId: 'l1', mapView: 'map', missionStep: 0, weight: 12, called: false, calling: false, checked: false, toast: '', kgSession: 0,
  shop: { owned: { emoji: {}, bg: {}, color: { 0: 1 } }, emoji: '', bg: '', color: 0 }, wardCat: 0, revealPick: null, evoFrom: 0, evoTo: 1, evoKey: 0,
  show: { tab: 'stages', style: 'cowboy', cat: 0, full: true }, chosenChar: 'fraise',
  pf: { modeP: 'sac', vol: 12, fresh: false, from: '17:30', to: '19:00', sac: true, car: true, sent: false }, partnerScreen: 'p_form',
};

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const stage = () => stageOf(S.level);
function unlocks() { const out = []; for (let l = 1; l <= S.level; l++) out.push({ lvl: l, cat: (l - 1) % 10, v: versionOf(l), style: S.chosen[l] || S.style }); return out; }
function outfit() {
  const o = {}, ul = unlocks();
  for (let cat = 0; cat < 10; cat++) {
    const items = ul.filter((u) => u.cat === cat);
    if (!items.length) continue;
    const eq = S.equipped[cat];
    const pick = eq === 'none' ? null : (eq && items.find((i) => i.lvl === eq)) || items[items.length - 1];
    if (pick) o[cat] = { style: pick.style, v: pick.v, lvl: pick.lvl };
  }
  return o;
}
const fullSet = (o) => (Object.keys(o).length === 10 && new Set(Object.values(o).map((x) => x.style)).size === 1 ? Object.values(o)[0].style : null);
const kgSaved = () => Math.round(((S.level - 1) * 11.8 + S.kgSession) * 10) / 10;
function myChar(size = 190, extra = {}) {
  const o = outfit(), fs = fullSet(o);
  return characterSVG(S.char, { stage: stage(), outfit: o, aura: !!fs, auraColor: fs === 'magicien' ? '#c9a8ff' : fs === 'chef' ? '#ffffff' : '#ffd76b', hue: S.shop.color, size, ...extra });
}
const themeBg = () => { const fs = fullSet(outfit()); return S.shop.bg ? SHOP.bg.find((b) => b[0] === S.shop.bg)[2] : fs ? STYLES[fs].bg : 'linear-gradient(180deg,#d9f3ff,#f4e9ff)'; };
const stageBox = (h, inner) => `<div class="stagebox" style="height:${h}px;background:${themeBg()}">${S.shop.emoji ? `<span class="em">${S.shop.emoji}</span>` : ''}${inner}</div>`;
const compat = (l) => (S.mode === 'car' ? l.modes.includes('car') : l.modes.includes('walk') && l.kg <= 25) && (!l.fresh || S.cold) && l.dist <= S.radius && !S.gone[l.id];
const linkEmoji = (l) => (l.fresh ? '🧊' : S.mode === 'car' && l.kg > 25 ? '🚗' : '🎒');
const pinColor = (l) => (l.fresh ? '#4fc1d6' : l.kg > 25 ? '#2a78d6' : '#ff9a3c');

const STEPS = {
  linker: [['intro', 'Présentation du principe'], ['signup', 'Inscription & personnage'], ['profile', 'Profil & rayon'], ['home', 'Accueil'], ['push', 'Notification push'], ['map', 'Carte des Links'], ['link', 'Fiche d’un Link'], ['mission', 'Mission en cours'], ['reward', 'Récompense'], ['evolution', 'Évolution (level 10)'], ['wardrobe', 'Garde-robe'], ['shop', 'Boutique à points']],
  partner: [['p_form', 'Demande de collecte'], ['p_notif', 'Notifications']],
  antenne: [['a_tab', 'Onglet Links Bénévoles']],
};

/* ---------- screens ---------- */
const TABS = [['home', '🏠', 'Accueil'], ['map', '🗺️', 'Links'], ['wardrobe', '👗', 'Garde-robe'], ['shop', '🛍️', 'Boutique'], ['profile', '👤', 'Profil']];
const tabbar = () => `<div class="tabbar">${TABS.map(([k, e, n]) => `<button class="${S.screen === k || (k === 'map' && ['link', 'mission'].includes(S.screen)) ? 'on' : ''}" data-a="go" data-s="${k}"><span>${e}</span>${n}</button>`).join('')}</div>`;
const phone = (inner, { tabs = false, dark = false, overlay = '' } = {}) => `<div class="device"><div class="notch"></div><div class="screen" style="${dark ? 'background:#0f0c29;color:#fff' : ''}"><div class="status" style="${dark ? 'color:#fff' : ''}"><span>9:41</span><span>📶 🔋</span></div>${S.toast ? `<div class="toast">${S.toast}</div>` : ''}${inner}${tabs ? tabbar() : ''}${overlay}</div></div>`;
const back = (to, label = 'Retour') => `<button data-a="go" data-s="${to}" style="font-weight:800;font-size:14px;color:var(--slate);margin:2px 0 8px">← ${label}</button>`;

function sIntro() {
  const slides = [
    `<div style="text-align:center"><div class="disp" style="font-size:34px;margin:6px 0 4px">Sauve de la nourriture,<br>un <span style="color:var(--org)">Link</span> à la fois !</div>
      <p style="color:var(--slate);font-weight:700;margin:6px 8px 14px">Un magasin a des invendus. Une association a faim de les recevoir. Toi, tu fais le trait d’union.</p>
      <div class="card" style="padding:14px 8px"><div style="display:flex;align-items:center;justify-content:space-around">
        <div style="font-size:46px">🏪</div><div style="flex:1;border-top:4px dotted var(--turq);margin:0 6px;position:relative"><span style="position:absolute;left:50%;top:-30px;transform:translateX(-50%)">${characterSVG('carotte', { stage: 1, size: 60, noScale: true, outfit: { 6: { style: 'cowboy', v: 1 } } })}</span></div><div style="font-size:46px">🏠</div></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:var(--slate);padding:6px 6px 0"><span>Magasin partenaire</span><span>Association ouverte</span></div></div>
      <div style="display:flex;gap:10px;margin-top:12px"><div class="card" style="flex:1;text-align:center;padding:12px 6px"><div style="font-size:30px">🎒</div><div class="disp" style="font-size:24px">25 kg</div><div style="font-size:12px;font-weight:800;color:var(--slate)">à pied ou à vélo</div></div>
      <div class="card" style="flex:1;text-align:center;padding:12px 6px"><div style="font-size:30px">🚗</div><div class="disp" style="font-size:24px">80 kg</div><div style="font-size:12px;font-weight:800;color:var(--slate)">en voiture</div></div></div></div>`,
    `<div><div class="disp" style="font-size:30px;text-align:center;margin:6px 0 14px">Comment ça marche ?</div>${[['🔔', 'Tu reçois un Link', 'Une notif t’avertit d’une collecte près de toi.'], ['📞', 'Tu appelles l’asso', 'Un coup de fil pour confirmer qu’elle peut recevoir.'], ['🎒', 'Tu récupères', 'Au magasin, dans la fenêtre de collecte.'], ['🎉', 'Tu livres et tu montes de level', 'Ton personnage grandit et s’habille !']].map(([e, t, d], i) => `<div class="card" style="display:flex;gap:12px;align-items:center;margin-bottom:10px"><div style="width:52px;height:52px;border-radius:16px;background:#fff3c4;display:flex;align-items:center;justify-content:center;font-size:28px;flex:none">${e}</div><div><div class="disp" style="font-size:18px">${i + 1}. ${t}</div><div style="font-size:13px;color:var(--slate);font-weight:600">${d}</div></div></div>`).join('')}</div>`,
    `<div style="text-align:center"><div class="disp" style="font-size:28px;margin:6px 0 4px">Ajoute Linkee à ton écran d’accueil</div>
      <div style="background:#ffe6e2;color:#a3261c;border-radius:14px;padding:8px 10px;font-weight:800;font-size:12.5px;margin:6px 0 12px">📵 Obligatoire sur iPhone pour recevoir les notifications de nouveaux Links</div>
      ${[['1', 'Appuie sur', '<span style="font-size:24px">⬆️</span> Partager (barre du bas de Safari)'], ['2', 'Choisis', '➕ « Sur l’écran d’accueil »'], ['3', 'Appuie sur', 'Ajouter — puis ouvre Linkee depuis ton écran d’accueil']].map(([n, a, b]) => `<div class="card" style="display:flex;gap:12px;align-items:center;text-align:left;margin-bottom:10px"><div class="disp" style="width:36px;height:36px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;flex:none">${n}</div><div style="font-size:14px;font-weight:700"><span style="color:var(--slate)">${a}</span><br>${b}</div></div>`).join('')}
      <div style="display:flex;justify-content:center;gap:10px;margin-top:6px"><div style="background:#0a1a3f;color:#fff;border-radius:18px;padding:10px 12px;display:flex;flex-direction:column;align-items:center;font-size:10px;font-weight:800;gap:4px"><span style="font-size:30px">🍓</span>Linkee</div></div>
      <div style="font-size:12px;color:var(--slate);font-weight:700;margin-top:8px">Android : « Installer l’application » dans le menu du navigateur.</div></div>`,
  ];
  const last = S.slide === 2;
  return phone(`<div class="content" style="display:flex;flex-direction:column"><div style="flex:1">${slides[S.slide]}</div><div class="dots">${[0, 1, 2].map((i) => `<i class="${i === S.slide ? 'on' : ''}"></i>`).join('')}</div>
    <button class="btn" data-a="${last ? 'go' : 'slide'}" data-s="signup" data-d="1">${last ? 'C’est parti !' : 'Suivant'}</button>${last ? '' : `<button data-a="go" data-s="signup" style="margin:10px auto 0;font-weight:800;color:var(--muted);font-size:13px">Passer</button>`}</div>`);
}

function sSignup() {
  const avail = ['fraise', 'banane', 'carotte', 'tomate'];
  const fruits = [['fraise'], ['Pomme', 0], ['banane'], ['Cerise', 1], ['Orange', 2], ['Citron', 3], ['Kiwi', 4], ['Poire', 5], ['Pastèque', 6], ['Ananas', 7]];
  const legs = [['carotte'], ['tomate'], ['Brocoli', 8], ['Aubergine', 9], ['Poivron', 10], ['Radis', 11], ['Petit pois', 12], ['Potiron', 13], ['Pomme de terre', 14], ['Poireau', 15]];
  const cell = (it) => {
    if (avail.includes(it[0])) { const on = S.chosenChar === it[0]; return `<button data-a="pickchar" data-c="${it[0]}" style="border-radius:18px;padding:4px 0 6px;background:${on ? '#fff3c4' : '#fff'};border:2.5px solid ${on ? 'var(--sun-d)' : 'var(--line)'};position:relative;width:100%">${characterSVG(it[0], { stage: 0, size: 62, noScale: true })}<div style="font-size:11px;font-weight:800">${CH[it[0]].n}</div>${on ? '<span style="position:absolute;top:2px;right:4px">✅</span>' : ''}</button>`; }
    const l = LOCKED[it[1]];
    return `<div class="locked-ch" style="border-radius:18px;padding:4px 0 6px;background:#f6f0ea;border:2px dashed #d7cbbd;text-align:center;position:relative">${silhouette(l[2], 62)}<div style="font-size:10.5px;font-weight:800;color:var(--muted)">${l[0]}</div><span style="position:absolute;top:2px;right:5px;font-size:10px">🔒</span></div>`;
  };
  const c = CH[S.chosenChar];
  return phone(`<div class="content">${back('intro')}<h1 style="font-size:28px">Crée ton Linker</h1>
    ${stageBox(150, characterSVG(S.chosenChar, { stage: 0, size: 130, noScale: true }))}
    <div class="disp" style="text-align:center;font-size:20px;margin:6px 0 0">${c.n} <span style="font-size:13px;color:var(--slate);font-family:Nunito;font-weight:700">· Padawan</span></div>
    <label class="lbl">Ton prénom ou pseudo</label><input class="inp" value="${S.name}" data-i="name"><label class="lbl">E-mail</label><input class="inp" value="lea.martin@mail.fr">
    <label class="lbl">🍓 Fruits <span class="tag">2 sur 10 dans la preview</span></label><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${fruits.map(cell).join('')}</div>
    <label class="lbl">🥕 Légumes <span class="tag">2 sur 10 dans la preview</span></label><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${legs.map(cell).join('')}</div>
    <p style="font-size:12px;color:var(--slate);font-weight:700;text-align:center">Les autres personnages arrivent bientôt — ton choix se fait à l’inscription.</p>
    <button class="btn" data-a="startchar" style="margin-top:8px">Choisir ${c.n} !</button></div>`);
}

function sProfile() {
  const ty = typology(S.mode, S.radius), walk = S.mode === 'walk';
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], sl = ['Matin', 'Midi', 'Soir'], slt = ['8–12h', '12–17h', '17–20h'];
  return phone(`<div class="content"><h1 style="font-size:28px">Ton profil de Linker</h1>
    <div class="card" style="display:flex;gap:12px;align-items:center;margin-top:10px;background:linear-gradient(120deg,#fff3c4,#ffe0b0)"><div id="ty-e" style="font-size:40px">${ty.e}</div><div><div style="font-size:11px;font-weight:800;color:var(--slate);text-transform:uppercase;letter-spacing:.05em">Ta typologie</div><div class="disp" id="ty-t" style="font-size:25px">${ty.t}</div><div id="ty-s" style="font-size:12px;font-weight:700;color:var(--slate)">Rayon de ${S.radius} km · ${walk ? '25 kg max' : '80 kg max'}</div></div></div>
    <label class="lbl">Mon mode de déplacement</label><div style="display:flex;gap:10px">${[['walk', '🚶🚲', 'À pied / vélo', '25 kg max'], ['car', '🚗', 'Voiture', '80 kg max']].map(([k, e, n, d]) => `<button data-a="mode" data-m="${k}" class="card" style="flex:1;text-align:center;padding:12px 4px;border:3px solid ${S.mode === k ? 'var(--turq)' : 'var(--line)'};background:${S.mode === k ? '#e3f6fa' : '#fff'}"><div style="font-size:28px">${e}</div><div class="disp" style="font-size:16px">${n}</div><div style="font-size:11.5px;font-weight:700;color:var(--slate)">${d}</div></button>`).join('')}</div>
    <label class="lbl">Mon rayon d’intervention : <b style="color:var(--org)" id="ty-r">${S.radius} km</b></label>
    <input type="range" data-i="radius" min="${walk ? 1 : 5}" max="${walk ? 10 : 50}" step="${walk ? 1 : 5}" value="${S.radius}" style="width:100%;accent-color:var(--org);height:34px">
    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;color:var(--muted)"><span>${walk ? '1 km' : '5 km'}</span><span>${walk ? '10 km' : '50 km'}</span></div>
    <label class="lbl">Mes disponibilités (chaque semaine)</label>
    <div style="display:grid;grid-template-columns:38px repeat(3,1fr);gap:5px;align-items:center;font-size:12px;font-weight:800"><span></span>${sl.map((s, i) => `<span style="text-align:center;color:var(--slate)">${s}<br><small style="font-weight:700">${slt[i]}</small></span>`).join('')}
    ${days.map((d, di) => `<span>${d}</span>${sl.map((_, si) => `<button data-a="slot" data-d="${di}" data-t="${si}" class="slot ${S.slots[di] && S.slots[di][si] ? 'on' : ''}" style="height:34px">${S.slots[di] && S.slots[di][si] ? '✓' : ''}</button>`).join('')}`).join('')}</div>
    <div class="card" style="display:flex;gap:12px;align-items:center;margin-top:14px"><div style="font-size:30px">🧊</div><div style="flex:1"><div class="disp" style="font-size:17px">Collecte de frais</div><div style="font-size:12px;color:var(--slate);font-weight:600">J’ai un sac isotherme Linkee et des pains de glace.</div></div><button data-a="cold" style="width:56px;height:32px;border-radius:99px;background:${S.cold ? 'var(--grn)' : '#d6cfe0'};position:relative"><i style="position:absolute;top:3px;left:${S.cold ? 27 : 3}px;width:26px;height:26px;border-radius:50%;background:#fff;transition:left .2s"></i></button></div>
    <label class="lbl">Adresse de référence <small style="font-weight:700;color:var(--muted)">(si la géoloc n’est pas disponible)</small></label><input class="inp" value="${S.addr}">
    <button class="btn" data-a="go" data-s="home" style="margin-top:16px">Enregistrer mon profil</button></div>`, { tabs: true });
}

function nextInfo() {
  const L = S.level, nextEvo = Math.min(50, (Math.floor(L / 10) + 1) * 10), toEvo = nextEvo - L;
  const nl = L + 1, cat = CATS[(nl - 1) % 10];
  return { L, nextEvo, toEvo, nl, cat };
}
function sHome() {
  const n = nextInfo(), st = stage(), max = S.level >= 50;
  const evoSil = !max ? characterSVG(S.char, { stage: st + 1, size: 74, noScale: false }) : '';
  return phone(`<div class="content"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div><div style="font-size:12px;font-weight:800;color:var(--slate)">Salut ${S.name} ${S.shop.emoji || '👋'}</div><h1 style="font-size:26px">${STAGES[st].title}</h1></div><div class="badge" style="background:#fff3c4;font-size:14px;padding:6px 12px">🪙 ${S.points}</div></div>
    ${stageBox(250, myChar(210))}
    <div style="display:flex;align-items:center;gap:10px;margin:12px 0 6px"><div class="disp" style="background:var(--navy);color:#fff;border-radius:16px;padding:6px 14px;font-size:22px">Level ${S.level}</div><div style="font-weight:800;color:var(--slate);font-size:13px">${CH[S.char].n} · ${STAGES[st].title}</div></div>
    <div class="card" style="padding:12px"><div style="display:flex;justify-content:space-between;font-weight:800;font-size:13px;margin-bottom:6px"><span>Prochain level</span><span style="color:var(--org)">${S.xp} / 100 XP</span></div><div class="gauge"><i style="width:${S.xp}%"></i></div><div style="font-size:12px;color:var(--slate);font-weight:700;margin-top:6px">Livre un Link pour passer au level ${Math.min(50, n.nl)} 🎉</div></div>
    <div style="display:flex;gap:10px;margin-top:10px"><div class="card" style="flex:1;padding:10px"><div style="font-size:11px;font-weight:800;color:var(--slate)">🎁 Prochaine récompense</div><div style="display:flex;align-items:center;gap:8px;margin-top:6px"><div style="width:46px;height:46px;border-radius:14px;background:#efe6dc;display:flex;align-items:center;justify-content:center;font-size:24px;filter:grayscale(1) opacity(.45)">${max ? "" : n.cat.e}</div><div><div class="disp" style="font-size:15px">${max ? '—' : n.cat.n}</div><div style="font-size:11px;font-weight:700;color:var(--slate)">Level ${n.nl} · tu choisis le style</div></div></div></div>
    <div class="card" style="flex:1;padding:10px"><div style="font-size:11px;font-weight:800;color:var(--slate)">✨ Prochaine évolution</div><div style="display:flex;align-items:center;gap:6px;margin-top:2px"><div class="sil" style="width:52px;height:60px;overflow:hidden;flex:none">${max ? '' : evoSil.replace('width="74"', 'width="52"').replace(/height="[\d.]+"/, 'height="62"')}</div><div><div class="disp" style="font-size:15px">${max ? 'Niveau max !' : STAGES[st + 1].title}</div><div style="font-size:11px;font-weight:700;color:var(--slate)">${max ? 'Ambassadeur' : `dans ${n.toEvo} Link${n.toEvo > 1 ? 's' : ''}`}</div></div></div></div></div>
    <div style="display:flex;gap:10px;margin-top:10px"><div class="card" style="flex:1;text-align:center;padding:10px"><div class="disp" style="font-size:28px;color:var(--grn)">${kgSaved()}</div><div style="font-size:12px;font-weight:800;color:var(--slate)">kg sauvés 🌍</div></div><div class="card" style="flex:1;text-align:center;padding:10px"><div class="disp" style="font-size:28px;color:var(--blue)">${S.level - 1}</div><div style="font-size:12px;font-weight:800;color:var(--slate)">Links livrés 📦</div></div></div>
    <button class="btn" data-a="go" data-s="map" style="margin-top:14px">🗺️ Voir les Links près de moi</button><button class="btn ghost sm" data-a="go" data-s="push" style="margin-top:10px">🔔 Simuler une notification</button></div>`, { tabs: true });
}

function sPush() {
  return phone(`<div style="flex:1;padding:8px 14px;background:linear-gradient(160deg,#2b1f6b,#0f0c29 60%,#0b3b4a);display:flex;flex-direction:column;align-items:center;color:#fff">
    <div style="font-size:14px;font-weight:700;opacity:.8;margin-top:22px">Mardi 30 septembre</div><div class="disp" style="font-size:86px;line-height:1">17:12</div>
    <button data-a="go" data-s="map" style="margin-top:28px;width:100%;text-align:left;background:rgba(255,255,255,.88);color:var(--navy);border-radius:22px;padding:12px;backdrop-filter:blur(8px);box-shadow:0 10px 30px -8px rgba(0,0,0,.5);animation:pop .6s">
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:var(--slate)"><span style="width:22px;height:22px;border-radius:7px;background:var(--navy);display:inline-flex;align-items:center;justify-content:center">🍓</span>LINKEE · maintenant</div>
      <div class="disp" style="font-size:18px;margin-top:4px">🎒 Nouveau Link à 0,8 km !</div><div style="font-size:14px;font-weight:700;margin-top:2px">Boulangerie Ange → Maison des étudiants · 8 kg · 17h30–19h00 · +100 XP</div><div style="font-size:12px;font-weight:800;color:var(--turq-d);margin-top:6px">Touche pour voir le Link</div></button>
    <button data-a="go" data-s="map" style="margin-top:12px;width:100%;text-align:left;background:rgba(255,255,255,.55);color:var(--navy);border-radius:22px;padding:11px 12px"><div style="font-size:12px;font-weight:800;color:var(--slate)">LINKEE · il y a 2 min</div><div style="font-size:14px;font-weight:800;margin-top:2px">🧊 Link frais à 1,9 km — Monoprix Bellecour · 21 kg</div></button>
    <div style="margin-top:auto;font-size:12px;opacity:.7;font-weight:700;margin-bottom:12px">Notification push (PWA installée / app mobile)</div></div>`, { dark: true });
}

const mapSVG = () => `<svg viewBox="0 0 358 420" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0"><rect width="358" height="420" fill="#eef3e8"/>
  <path d="M-10 230 C 60 200 120 260 200 240 S 330 200 380 250 L 380 290 C 320 250 240 290 190 285 S 60 250 -10 280Z" fill="#a9d6f2"/>
  <rect x="20" y="20" width="90" height="70" rx="14" fill="#cfe9bd"/><rect x="250" y="330" width="90" height="70" rx="14" fill="#cfe9bd"/>
  <g stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"><path d="M0 120 H358"/><path d="M0 330 H358"/><path d="M100 0 V420"/><path d="M230 0 V420"/><path d="M0 60 L358 180"/><path d="M60 420 L200 200 L358 290"/></g>
  <g stroke="#ffe6b0" stroke-width="3" fill="none"><path d="M0 200 H358"/><path d="M170 0 V420"/><path d="M300 0 V420"/></g></svg>`;
function mapArea(dim = false) {
  const vis = LINKS.filter(compat);
  const pins = LINKS.filter((l) => !(l.id in S.gone && false)).map((l) => {
    if (!compat(l) && !S.gone[l.id]) return '';
    const e = linkEmoji(l), gone = S.gone[l.id];
    return `<div class="pin ${gone ? 'gone' : ''}" data-a="openlink" data-l="${l.id}" style="left:${l.x}px;top:${l.y}px"><b style="background:${pinColor(l)}"><span>${e}</span></b><em>${l.kg} kg</em></div>`;
  }).join('');
  return { vis, html: `<div style="position:relative;height:100%;${dim ? 'filter:blur(1px) brightness(.8)' : ''}">${mapSVG()}
    <div style="position:absolute;left:179px;top:210px;transform:translate(-50%,-50%);width:${Math.min(330, 70 + S.radius * (S.mode === 'walk' ? 26 : 5))}px;height:${Math.min(330, 70 + S.radius * (S.mode === 'walk' ? 26 : 5))}px;border-radius:50%;border:3px dashed rgba(42,120,214,.5);background:rgba(42,120,214,.07)"></div>
    <div style="position:absolute;left:179px;top:210px;transform:translate(-50%,-50%)"><div style="width:22px;height:22px;border-radius:50%;background:var(--blue);border:4px solid #fff;box-shadow:0 0 0 8px rgba(42,120,214,.25)"></div></div>${pins}</div>` };
}
function sMap(overlay = '') {
  const m = mapArea(!!overlay), vis = m.vis;
  const list = [...vis].sort((a, b) => a.dist - b.dist);
  const body = S.mapView === 'map' ? `<div style="flex:1;position:relative;margin:0 -0px">${m.html}</div>` : `<div class="content" style="padding-top:0">${list.length ? list.map((l) => `<button data-a="openlink" data-l="${l.id}" class="card" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;margin-bottom:10px"><div style="width:48px;height:48px;border-radius:15px;background:${pinColor(l)};display:flex;align-items:center;justify-content:center;font-size:24px;flex:none">${linkEmoji(l)}</div><div style="flex:1;min-width:0"><div class="disp" style="font-size:17px">${l.p}</div><div style="font-size:12.5px;color:var(--slate);font-weight:700">${l.win} · ${l.kg} kg${l.fresh ? ' · frais' : ''}</div></div><div style="text-align:right"><div class="disp" style="font-size:18px;color:var(--org)">${l.dist} km</div><div style="font-size:11px;font-weight:800;color:var(--grn)">+100 XP</div></div></button>`).join('') : '<p style="text-align:center;color:var(--slate);font-weight:700;margin-top:40px">Aucun Link ne correspond à ton profil pour l’instant.</p>'}</div>`;
  return phone(`<div style="padding:0 18px 8px;flex:none"><div style="display:flex;justify-content:space-between;align-items:center"><h1 style="font-size:26px">${vis.length} Link${vis.length > 1 ? 's' : ''} pour toi</h1><div style="display:flex;background:#efe6dc;border-radius:99px;padding:3px">${[['map', '🗺️'], ['list', '☰']].map(([k, e]) => `<button data-a="mapview" data-v="${k}" style="padding:5px 12px;border-radius:99px;font-weight:800;${S.mapView === k ? 'background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.15)' : ''}">${e}</button>`).join('')}</div></div><div style="font-size:12px;font-weight:700;color:var(--slate);margin-top:2px">${S.mode === 'walk' ? '🚶 À pied / vélo' : '🚗 Voiture'} · rayon ${S.radius} km${S.cold ? ' · 🧊 frais OK' : ''}</div></div>${body}`, { tabs: !overlay, overlay });
}

function sLink() {
  const l = LINKS.find((x) => x.id === S.linkId), a = ASSOS[l.asso], e = linkEmoji(l);
  const cond = [[S.mode === 'walk' ? `Volume ${l.kg} kg ≤ 25 kg (à pied / vélo)` : `Volume ${l.kg} kg ≤ 80 kg (voiture)`, true], [`Le magasin est à ${l.dist} km — dans ton rayon de ${S.radius} km`, true], [S.mode === 'walk' ? 'Collecte en sac à dos acceptée par le magasin 🎒' : 'Collecte en voiture acceptée par le magasin 🚗', true], ...(l.fresh ? [['Produits frais : tu as ton sac isotherme 🧊', S.cold]] : []), ['Fenêtre ' + l.win + ' compatible avec tes disponibilités', true]];
  const sheet = `<div class="sheet"><div class="grab"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div class="badge" style="background:${pinColor(l)};color:#fff">${e} ${l.fresh ? 'Collecte de frais' : l.kg > 25 ? 'Collecte voiture' : 'Collecte sac à dos'}</div><h2 style="font-size:24px;margin-top:6px">${l.p}</h2><div style="font-size:13px;color:var(--slate);font-weight:700">${l.pa}</div></div><button data-a="go" data-s="map" style="font-size:22px;color:var(--muted)">✕</button></div>
    <div style="display:flex;gap:8px;margin:12px 0"><div class="card" style="flex:1;text-align:center;padding:8px"><div class="disp" style="font-size:22px">${l.kg} kg</div><div style="font-size:11px;font-weight:800;color:var(--slate)">volume estimé</div></div><div class="card" style="flex:1;text-align:center;padding:8px"><div class="disp" style="font-size:16px;line-height:1.3">${l.win}</div><div style="font-size:11px;font-weight:800;color:var(--slate)">fenêtre de collecte</div></div><div class="card" style="flex:1;text-align:center;padding:8px;background:#e9f9f1"><div class="disp" style="font-size:22px;color:var(--grn)">+100</div><div style="font-size:11px;font-weight:800;color:var(--slate)">XP = 1 level</div></div></div>
    <div class="card" style="background:#f4f8ff;border-color:#dbe7fb"><div style="font-size:11px;font-weight:800;color:var(--blue);text-transform:uppercase;letter-spacing:.05em">🏠 Association de destination</div><div class="disp" style="font-size:20px;margin-top:2px">${a.n}</div><div style="font-size:13px;font-weight:700;color:var(--slate)">${a.addr}</div><div style="font-size:12.5px;font-weight:700;margin-top:4px">Ouverte ${a.open} · Trajet magasin → asso : <b>${l.trip} km</b></div>
      <button data-a="call" class="btn grn sm" style="margin-top:10px">📞 Appeler ${a.tel}</button></div>
    <div style="margin:12px 0 4px">${cond.map(([t, ok]) => `<div style="font-size:13px;padding:3px 0;font-weight:700" class="${ok ? 'ok' : 'no'}">${ok ? '✔' : '✘'} <span style="color:var(--navy)">${t}</span></div>`).join('')}</div>
    <button data-a="check" style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:${S.checked ? '#e9f9f1' : '#fff7dd'};border:2px solid ${S.checked ? 'var(--grn)' : 'var(--sun-d)'};border-radius:16px;padding:12px;font-weight:800;font-size:14px;margin:8px 0 12px"><span style="width:28px;height:28px;border-radius:9px;border:2.5px solid ${S.checked ? 'var(--grn)' : 'var(--sun-d)'};background:${S.checked ? 'var(--grn)' : '#fff'};color:#fff;display:flex;align-items:center;justify-content:center;flex:none">${S.checked ? '✓' : ''}</span>Asso contactée, livraison OK</button>
    <button class="btn ${S.checked ? '' : 'dis'}" data-a="accept">Accepter ce Link</button><div style="text-align:center;font-size:11.5px;font-weight:700;color:var(--muted);margin-top:8px">Premier arrivé, premier servi — appelle l’asso avant d’accepter.</div></div>`;
  const call = S.calling ? `<div style="position:absolute;inset:0;z-index:40;background:rgba(10,10,40,.92);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px"><div style="font-size:60px">📞</div><div class="disp" style="font-size:26px">${a.n}</div><div style="opacity:.8;font-weight:700">Appel en cours… ${a.tel}</div><button class="btn" data-a="endcall" style="width:220px;margin-top:20px;background:var(--red);color:#fff;box-shadow:0 5px 0 #8a1f19">Raccrocher</button></div>` : '';
  return sMap(sheet + call);
}

function sMission() {
  const l = LINKS.find((x) => x.id === S.linkId), a = ASSOS[l.asso], st = S.missionStep;
  const steps = ['Proposée', 'Acceptée', 'Collectée', 'Livrée'], cur = st + 1;
  const stepper = `<div style="display:flex;align-items:center;margin:8px 0 14px">${steps.map((s, i) => `<div style="flex:1;text-align:center;position:relative"><div style="width:34px;height:34px;margin:0 auto;border-radius:50%;background:${i <= cur ? 'var(--grn)' : '#e5dccf'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800">${i <= cur ? '✓' : i + 1}</div><div style="font-size:11px;font-weight:800;margin-top:3px;color:${i <= cur ? 'var(--navy)' : 'var(--muted)'}">${s}</div></div>${i < 3 ? `<div style="flex:.6;height:4px;background:${i < cur ? 'var(--grn)' : '#e5dccf'};margin-bottom:16px;border-radius:9px"></div>` : ''}`).join('')}</div>`;
  let main = '';
  if (st === 0) main = `<div class="card"><div style="font-size:12px;font-weight:800;color:var(--org)">ÉTAPE 1 · RÉCUPÉRER</div><div class="disp" style="font-size:24px;margin-top:2px">${l.p}</div><div style="font-weight:700;color:var(--slate)">${l.pa}</div><div style="margin-top:8px;font-weight:800">🕐 Passe entre ${l.win}</div><div style="margin-top:2px;font-weight:700">${linkEmoji(l)} Environ ${l.kg} kg${l.fresh ? ' · ' + 'garde le frais au froid' : ''}</div></div>
    <div class="card" style="margin-top:12px;height:120px;position:relative;overflow:hidden;padding:0">${mapSVG().replace('height="100%"', 'height="120"')}<div style="position:absolute;left:24px;top:70px;width:22px;height:22px;border-radius:50%;background:var(--blue);border:4px solid #fff"></div><div style="position:absolute;right:40px;top:24px;font-size:28px">🏪</div><div style="position:absolute;left:44px;top:80px;width:220px;border-top:4px dotted var(--turq);transform:rotate(-14deg);transform-origin:left"></div></div>
    <button class="btn grn" data-a="collected" style="margin-top:16px">🎒 J’ai récupéré les produits</button>`;
  else if (st === 1) main = `<div class="card"><div style="font-size:12px;font-weight:800;color:var(--blue)">ÉTAPE 2 · LIVRER</div><div class="disp" style="font-size:24px;margin-top:2px">${a.n}</div><div style="font-weight:700;color:var(--slate)">${a.addr}</div><div style="margin-top:8px;font-weight:800">🕐 Ouverte ${a.open}</div><div style="font-weight:700">📞 ${a.tel}</div></div>
    <div class="card" style="margin-top:12px;background:#fff7dd;border-color:var(--sun)"><div class="disp" style="font-size:17px">⚖️ Pèse ce que tu livres</div><div style="display:flex;align-items:center;justify-content:center;gap:14px;margin:8px 0"><button data-a="wt" data-d="-1" class="btn sm" style="width:56px;background:#fff;box-shadow:0 0 0 2px var(--line)">−</button><div class="disp" style="font-size:46px;min-width:130px;text-align:center">${S.weight} <span style="font-size:22px">kg</span></div><button data-a="wt" data-d="1" class="btn sm" style="width:56px;background:#fff;box-shadow:0 0 0 2px var(--line)">+</button></div><div style="text-align:center;font-size:12px;font-weight:700;color:var(--slate)">Poids réel à la livraison (max ${S.mode === 'walk' ? 25 : 80} kg)</div></div>
    <button class="btn grn" data-a="delivered" style="margin-top:16px">✅ Livré à l’association</button>`;
  return phone(`<div class="content">${back('map', 'Carte')}<h1 style="font-size:28px">Mission en cours</h1>${stepper}${main}</div>`, { tabs: true });
}

function sReward() {
  const L = S.level, cat = CATS[(L - 1) % 10], v = versionOf(L), excl = L % 10 === 0;
  const pick = S.chosen[L] || S.revealPick || null;
  const prev = (style) => characterSVG(S.char, { stage: stage(), outfit: { [(L - 1) % 10]: { style, v } }, size: 88, hue: S.shop.color });
  const conf = Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${['#ffcf3d', '#ff6b6b', '#4fc1d6', '#7c5cd9', '#1baf7a'][i % 5]};animation-delay:${(i % 9) * .25}s;animation-duration:${2.6 + (i % 4) * .5}s"></i>`).join('');
  return phone(`<div class="confetti" style="position:absolute;inset:0;pointer-events:none;z-index:5">${conf}</div><div class="content"><div style="text-align:center"><div class="disp" style="font-size:44px;color:var(--org)">Level ${L} !</div><div style="font-weight:800;color:var(--slate)">Link livré · +${S.lastKg || 12.4} kg sauvés · +100 XP · 🪙 +30</div></div>
    ${stageBox(190, myChar(160))}
    <div class="card" style="margin-top:12px;background:#fff3c4;border-color:var(--sun)"><div style="font-size:12px;font-weight:800;color:#7a5200;text-transform:uppercase;letter-spacing:.05em">🎁 Nouvel accessoire débloqué</div><div class="disp" style="font-size:22px">${cat.e} ${cat.n} — version ${v}/5</div>${excl ? '<div style="font-size:12.5px;font-weight:800;color:var(--org);margin-top:2px">✨ Level pallier : accessoire d’évolution exclusif inclus</div>' : ''}<div style="font-size:12.5px;font-weight:700;color:var(--slate);margin-top:2px">Choisis le style de ton nouvel accessoire :</div></div>
    <div style="display:flex;gap:8px;margin-top:10px">${Object.keys(STYLES).map((k) => `<button data-a="pickstyle" data-st="${k}" class="card" style="flex:1;padding:6px 2px;text-align:center;border:3px solid ${pick === k ? 'var(--grn)' : 'var(--line)'};background:${pick === k ? '#e9f9f1' : '#fff'}">${prev(k)}<div class="disp" style="font-size:14px">${STYLES[k].e} ${STYLES[k].n.split(' ')[0]}</div><div style="font-size:10.5px;font-weight:700;color:var(--slate);line-height:1.2;padding:0 2px">${itemName(k, (L - 1) % 10, v)}</div></button>`).join('')}</div>
    <div style="display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap"><span style="font-size:11px;font-weight:800;color:var(--muted)">Bientôt :</span>${FUTURE_STYLES.map((f) => `<span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px;background:#efe6dc;color:var(--muted)">🔒 ${f.n}</span>`).join('')}</div>
    <button class="btn ${pick ? '' : 'dis'}" data-a="equipnew" style="margin-top:14px">${pick ? 'Équiper et continuer' : 'Choisis un style'}</button></div>`);
}

function sEvolution() {
  const from = S.evoFrom, to = S.evoTo, ck = S.char;
  return phone(`<div style="flex:1;position:relative;background:radial-gradient(circle at 50% 40%,#5b3fa6,#1c1146 70%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:18px">
    <div class="evo-flash" id="evoflash"></div>
    <div id="evotext1" style="font-family:'Baloo 2';font-size:26px;font-weight:800;margin-bottom:10px">Oh ? ${CH[ck].n} réagit…</div>
    <div style="position:relative;width:280px;height:340px;display:flex;align-items:center;justify-content:center">
      <div class="evo-old" id="evoold" style="position:absolute">${characterSVG(ck, { stage: from, size: 240, outfit: evoOutfit(from), noScale: false })}</div>
      <div class="evo-new" id="evonew" style="position:absolute">${characterSVG(ck, { stage: to, size: 270, outfit: evoOutfit(to), noScale: false })}</div>
    </div>
    <div id="evotext2" style="opacity:0;transition:opacity .8s"><div class="disp" style="font-size:32px;color:var(--sun)">${CH[ck].n} évolue !</div><div style="font-weight:800;font-size:17px;margin-top:4px">${STAGES[from].title} → ${STAGES[to].title}</div>
      <div style="background:rgba(255,255,255,.15);border-radius:14px;padding:8px 12px;margin-top:10px;font-size:13px;font-weight:800">🎁 Accessoire d’évolution exclusif débloqué</div>
      <button class="btn" data-a="go" data-s="home" style="margin-top:14px">Super !</button><button data-a="replayevo" style="margin-top:8px;font-weight:800;font-size:13px;opacity:.8">↻ Rejouer l’animation</button></div></div>`, { dark: true });
}
const evoOutfit = (st) => { const o = {}; for (let c = 0; c < 10; c++) o[c] = { style: S.style, v: Math.min(5, st + 1) }; return o; };

function sWardrobe() {
  const o = outfit(), fs = fullSet(o), ul = unlocks(), cat = S.wardCat;
  const items = ul.filter((u) => u.cat === cat), nxt = S.level + 1;
  const eqCount = Object.keys(o).length;
  return phone(`<div class="content"><h1 style="font-size:28px">Ma garde-robe</h1>
    ${stageBox(230, myChar(190))}
    <div class="card" style="margin-top:10px;display:flex;gap:10px;align-items:center;${fs ? 'background:linear-gradient(120deg,#fff3c4,#ffe0f0);border-color:var(--sun)' : ''}"><div style="font-size:30px">${fs ? '🌟' : '👔'}</div><div style="flex:1"><div class="disp" style="font-size:16px">${fs ? `Tenue complète ${STYLES[fs].n} !` : 'Tenue en cours'}</div><div style="font-size:12px;font-weight:700;color:var(--slate)">${fs ? 'Bonus : aura + fond thématique 🎉' : `${eqCount}/10 accessoires · 10 catégories dans le même style = bonus visuel`}</div></div></div>
    <div style="display:flex;gap:6px;overflow-x:auto;margin:12px -18px 8px;padding:0 18px;scrollbar-width:none">${CATS.map((c, i) => `<button data-a="wcat" data-c="${i}" style="flex:none;width:52px;height:60px;border-radius:16px;background:${cat === i ? 'var(--navy)' : '#fff'};color:${cat === i ? '#fff' : 'var(--navy)'};border:2px solid ${cat === i ? 'var(--navy)' : 'var(--line)'};font-size:22px;position:relative">${c.e}${o[i] ? `<i style="position:absolute;right:4px;top:3px;width:9px;height:9px;border-radius:50%;background:var(--grn)"></i>` : ''}<div style="font-size:8.5px;font-weight:800">${c.n.split(' ')[0]}</div></button>`).join('')}</div>
    <div class="disp" style="font-size:18px;margin-bottom:6px">${CATS[cat].e} ${CATS[cat].n}</div>
    ${items.length ? items.map((it) => { const on = o[cat] && o[cat].lvl === it.lvl; return `<button data-a="equip" data-c="${cat}" data-l="${it.lvl}" class="card" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin-bottom:8px;padding:10px;border:2.5px solid ${on ? 'var(--grn)' : 'var(--line)'}"><div style="width:52px;height:52px;border-radius:14px;background:${STYLES[it.style].bg};display:flex;align-items:center;justify-content:center;font-size:26px">${STYLES[it.style].e}</div><div style="flex:1"><div class="disp" style="font-size:16px">${itemName(it.style, cat, it.v)}</div><div style="font-size:11.5px;font-weight:700;color:var(--slate)">${STYLES[it.style].n} · version ${it.v}/5 · level ${it.lvl}</div></div><span style="font-weight:800;font-size:12px;color:${on ? 'var(--grn)' : 'var(--muted)'}">${on ? '✓ Équipé' : 'Équiper'}</span></button>`; }).join('') : '<div class="card" style="text-align:center;color:var(--slate);font-weight:700">Rien encore dans cette catégorie.</div>'}
    ${items.length ? `<button data-a="unequip" data-c="${cat}" class="btn ghost sm" style="margin-bottom:8px">Retirer cet accessoire</button>` : ''}
    <div class="card" style="background:#f6f0ea;border-style:dashed"><div style="font-size:12px;font-weight:800;color:var(--muted)">🔒 Prochain déblocage : level ${nxt} → ${CATS[(nxt - 1) % 10].e} ${CATS[(nxt - 1) % 10].n}</div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${FUTURE_STYLES.slice(0, 7).map((f) => `<span style="font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:99px;background:#e8e0d6;color:var(--muted)">${f.e} ${f.n}</span>`).join('')}</div></div></div>`, { tabs: true });
}

function sShop() {
  const tab = S.shopTab || 'emoji';
  const own = S.shop.owned;
  const item = (kind, key, name, price, visual, on, owned) => `<button data-a="buy" data-k="${kind}" data-v="${key}" data-p="${price}" class="card" style="text-align:center;padding:10px 4px;border:3px solid ${on ? 'var(--grn)' : 'var(--line)'};position:relative"><div style="height:64px;display:flex;align-items:center;justify-content:center;font-size:34px">${visual}</div><div class="disp" style="font-size:14px">${name}</div><div style="font-size:12px;font-weight:800;color:${owned ? 'var(--grn)' : 'var(--org)'}">${on ? '✓ Utilisé' : owned ? 'Utiliser' : '🪙 ' + price}</div></button>`;
  let grid = '';
  if (tab === 'emoji') grid = SHOP.emoji.map(([e, n, p]) => item('emoji', e, n, p, e, S.shop.emoji === e, own.emoji[e])).join('');
  if (tab === 'bg') grid = SHOP.bg.map(([k, n, bg, p]) => item('bg', k, n, p, `<span style="display:block;width:64px;height:60px;border-radius:14px;background:${bg}"></span>`, S.shop.bg === k, own.bg[k])).join('');
  if (tab === 'color') grid = SHOP.color.map(([h, n, p]) => item('color', h, n, p, `<span style="display:inline-block;filter:hue-rotate(${h}deg)">🍓</span>`, S.shop.color === h, own.color[h])).join('');
  return phone(`<div class="content"><div style="display:flex;justify-content:space-between;align-items:center"><h1 style="font-size:28px">Boutique</h1><div class="badge" style="background:#fff3c4;font-size:15px;padding:7px 13px">🪙 ${S.points}</div></div>
    ${stageBox(200, myChar(160))}
    <div style="display:flex;gap:6px;margin:12px 0">${[['emoji', '😀 Émoticônes'], ['bg', '🖼️ Fonds'], ['color', '🎨 Couleurs']].map(([k, n]) => `<button data-a="shoptab" data-t="${k}" class="pill ${tab === k ? 'on' : ''}" style="flex:1;padding:9px 4px">${n}</button>`).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${grid}</div><p style="font-size:12px;font-weight:700;color:var(--slate);text-align:center;margin-top:12px">Les points se gagnent à chaque Link livré. Les accessoires, eux, se débloquent avec les levels — pas avec les points.</p></div>`, { tabs: true });
}

function sShowroom() {
  const sh = S.show;
  let body = '';
  if (sh.tab === 'stages') {
    const cells = STAGES.map((s, i) => { const o = {}; if (sh.full) for (let c = 0; c < 10; c++) o[c] = { style: sh.style, v: Math.min(5, i + 1) }; return `<div class="card" style="text-align:center;padding:6px 2px"><div style="background:${STYLES[sh.style].bg};border-radius:16px;overflow:hidden">${characterSVG(S.char, { stage: i, size: 112, outfit: o, aura: sh.full && i >= 3, auraColor: sh.style === 'magicien' ? '#c9a8ff' : '#ffd76b' })}</div><div class="disp" style="font-size:14px;margin-top:3px">${s.title}</div><div style="font-size:10.5px;font-weight:800;color:var(--slate)">niveau ${s.from}${s.to > s.from ? '–' + s.to : ''}</div></div>`; }).join('');
    body = `<div class="pillrow" style="margin-bottom:8px">${Object.keys(CH).map((k) => `<button data-a="showchar" data-c="${k}" class="pill ${S.char === k ? 'on' : ''}">${CH[k].e} ${CH[k].n}</button>`).join('')}</div>
      <div class="pillrow" style="margin-bottom:8px">${Object.keys(STYLES).map((k) => `<button data-a="showstyle" data-st="${k}" class="pill ${sh.style === k ? 'on' : ''}">${STYLES[k].e} ${STYLES[k].n.split(' ')[0]}</button>`).join('')}<button data-a="showfull" class="pill ${sh.full ? 'on' : ''}">👔 Tenue complète</button></div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${cells}</div>`;
  } else {
    const cells = [1, 2, 3, 4, 5].map((v) => `<div class="card" style="text-align:center;padding:6px 2px"><div style="background:${STYLES[sh.style].bg};border-radius:16px;overflow:hidden">${characterSVG(S.char, { stage: v === 5 ? 4 : v - 1 >= 4 ? 4 : v, size: 128, noScale: true, outfit: { [sh.cat]: { style: sh.style, v } } })}</div><div class="disp" style="font-size:14px;margin-top:3px">Version ${v}/5</div><div style="font-size:11px;font-weight:800;color:var(--slate);padding:0 4px">${itemName(sh.style, sh.cat, v)}</div></div>`).join('');
    body = `<div class="pillrow" style="margin-bottom:8px">${Object.keys(CH).map((k) => `<button data-a="showchar" data-c="${k}" class="pill ${S.char === k ? 'on' : ''}">${CH[k].e}</button>`).join('')}${Object.keys(STYLES).map((k) => `<button data-a="showstyle" data-st="${k}" class="pill ${sh.style === k ? 'on' : ''}">${STYLES[k].e} ${STYLES[k].n.split(' ')[0]}</button>`).join('')}</div>
      <div style="display:flex;gap:5px;overflow-x:auto;margin-bottom:8px;scrollbar-width:none">${CATS.map((c, i) => `<button data-a="showcat" data-c="${i}" style="flex:none;width:46px;height:46px;border-radius:14px;font-size:20px;background:${sh.cat === i ? 'var(--navy)' : '#fff'};border:2px solid ${sh.cat === i ? 'var(--navy)' : 'var(--line)'}">${c.e}</button>`).join('')}</div>
      <div class="disp" style="font-size:17px;margin-bottom:6px">${CATS[sh.cat].n} · ${STYLES[sh.style].n} : 5 versions</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${cells}</div>`;
  }
  return phone(`<div class="content"><h1 style="font-size:26px">Vitrine <span class="tag">dev</span></h1><div style="display:flex;gap:6px;margin:8px 0">${[['stages', '6 stades'], ['acc', 'Accessoires']].map(([k, n]) => `<button data-a="showtab" data-t="${k}" class="pill ${sh.tab === k ? 'on' : ''}" style="flex:1">${n}</button>`).join('')}</div>${body}</div>`);
}

/* ---------- partner + antenne ---------- */
function sPartnerForm() {
  const f = S.pf, cap = f.modeP === 'sac' ? 25 : 80, vol = Math.min(f.vol, cap);
  const m = (t) => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3)), dur = m(f.to) - m(f.from), lead = m(f.from) - (16 * 60 + 10);
  const conds = [[`Volume ≤ ${cap} kg (${f.modeP === 'sac' ? 'sac à dos 🎒' : 'voiture 🚗'})`, vol <= cap], [`Fenêtre d’au moins 1 h (${Math.floor(dur / 60)} h ${String(dur % 60).padStart(2, '0')})`, dur >= 60], ['Délai de prévenance d’au moins 30 min avant le début', lead >= 30], [f.modeP === 'sac' ? 'Collecte en sac à dos activée sur ta fiche' : 'Collecte en voiture activée sur ta fiche', f.modeP === 'sac' ? f.sac : f.car]];
  const ok = conds.every((c) => c[1]);
  const open = m(f.to) <= 19 * 60 + 30 && m(f.from) >= 9 * 60;
  return phone(`<div style="background:var(--navy);color:#fff;padding:6px 18px 14px;flex:none"><div style="font-size:12px;font-weight:700;opacity:.7">Espace partenaire · Boulangerie Ange</div><h1 style="font-size:24px">Demande de collecte bénévole</h1></div>
    <div class="content" style="padding-top:12px"><div class="card"><div class="disp" style="font-size:16px;margin-bottom:6px">Ma fiche — collectes bénévoles</div>${[['🎒', 'Collecte en sac à dos possible', 'sac'], ['🚗', 'Collecte en voiture possible', 'car']].map(([e, t, k]) => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><span style="font-size:22px">${e}</span><span style="flex:1;font-weight:800;font-size:14px">${t}</span><button data-a="pft" data-k="${k}" style="width:52px;height:30px;border-radius:99px;background:${f[k] ? 'var(--grn)' : '#d6cfe0'};position:relative"><i style="position:absolute;top:3px;left:${f[k] ? 25 : 3}px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .2s"></i></button></div>`).join('')}<div style="font-size:11.5px;color:var(--slate);font-weight:700">Ces pictos s’affichent à côté du nom du partenaire partout dans l’appli : <b>Boulangerie Ange 🎒🚗</b></div></div>
      <label class="lbl">Type de collecte</label><div style="display:flex;gap:8px">${[['sac', '🎒 Sac à dos', '25 kg max'], ['car', '🚗 Voiture', '80 kg max']].map(([k, n, d]) => `<button data-a="pfm" data-m="${k}" class="card" style="flex:1;text-align:center;padding:10px 4px;border:3px solid ${f.modeP === k ? 'var(--turq)' : 'var(--line)'}"><div class="disp" style="font-size:17px">${n}</div><div style="font-size:11.5px;font-weight:700;color:var(--slate)">${d}</div></button>`).join('')}</div>
      <label class="lbl">Volume estimé : <b style="color:var(--org)" id="pf-vol">${vol} kg</b></label><input type="range" min="1" max="${cap}" value="${vol}" data-i="pfvol" style="width:100%;accent-color:var(--org)">
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px"><span style="font-size:24px">🧊</span><span style="flex:1;font-weight:800">Produits frais ?</span><button data-a="pft" data-k="fresh" style="width:52px;height:30px;border-radius:99px;background:${f.fresh ? 'var(--turq-d)' : '#d6cfe0'};position:relative"><i style="position:absolute;top:3px;left:${f.fresh ? 25 : 3}px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .2s"></i></button></div>
      <label class="lbl">Fenêtre de collecte <small style="color:var(--muted)">(il est 16h10)</small></label><div style="display:flex;gap:8px;align-items:center"><input type="time" class="inp" value="${f.from}" data-i="pffrom"><span>→</span><input type="time" class="inp" value="${f.to}" data-i="pfto"></div>
      <div class="card" style="margin-top:14px;background:#f4f8ff;border-color:#dbe7fb"><div class="disp" style="font-size:15px;margin-bottom:4px">Conditions d’éligibilité</div>${conds.map(([t, k]) => `<div style="font-size:13px;font-weight:700;padding:2px 0" class="${k ? 'ok' : 'no'}">${k ? '✔' : '✘'} <span style="color:var(--navy)">${t}</span></div>`).join('')}</div>
      <div class="card" style="margin-top:10px;background:${open ? '#e9f9f1' : '#ffe6e2'};border-color:${open ? 'var(--grn)' : 'var(--red)'}"><div style="font-size:12px;font-weight:800;color:var(--slate)">Association de destination (la plus proche, ouverte sur ce créneau)</div><div class="disp" style="font-size:17px">${open ? '🏠 Maison des étudiants · 1,2 km' : 'Aucune association disponible sur ce créneau'}</div>${open ? '' : '<div style="font-size:12px;font-weight:700;color:var(--slate)">Essaie une fenêtre entre 9h et 19h30.</div>'}</div>
      ${f.sent ? `<div class="card" style="margin-top:12px;text-align:center;background:#e9f9f1;border-color:var(--grn)"><div style="font-size:30px">📨</div><div class="disp" style="font-size:18px">Demande envoyée aux Linkers proches</div></div>` : ''}
      <button class="btn navy ${ok && open ? '' : 'dis'}" data-a="pfsend" style="margin-top:14px">Envoyer la demande</button><div style="height:6px"></div></div>`);
}
function sPartnerNotif() {
  const c = (emoji, t, d, time, ch) => `<div class="card" style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><div style="width:62px;height:66px;border-radius:16px;background:linear-gradient(180deg,#d9f3ff,#f4e9ff);overflow:hidden;flex:none;display:flex;align-items:flex-end;justify-content:center">${characterSVG(ch[0], { stage: ch[1], size: 58, noScale: false })}</div><div style="flex:1"><div style="font-size:11px;font-weight:800;color:var(--muted)">${time}</div><div class="disp" style="font-size:17px">${emoji} ${t}</div><div style="font-size:13px;font-weight:700;color:var(--slate)">${d}</div></div></div>`;
  return phone(`<div style="background:var(--navy);color:#fff;padding:6px 18px 14px;flex:none"><div style="font-size:12px;font-weight:700;opacity:.7">Espace partenaire · Boulangerie Ange</div><h1 style="font-size:24px">Notifications</h1></div><div class="content" style="padding-top:14px">
    ${c('✅', 'Link accepté', 'Léa (Linker · Fraise niveau 12) vient chercher tes 8 kg entre 17h30 et 19h00.', 'il y a 2 min', ['fraise', 1])}
    ${c('📦', 'Link livré', '8,4 kg livrés à la Maison des étudiants. Merci ! Ton don compte dans ton bilan RSE.', 'il y a 1 h', ['fraise', 1])}
    ${c('✅', 'Link accepté', 'Sam (Linker · Tomate niveau 34) vient avec sa voiture.', 'hier', ['tomate', 3])}
    <div style="font-size:12px;color:var(--slate);font-weight:700;text-align:center">Le partenaire ne voit que le prénom, le personnage et le niveau du Linker.</div></div>`);
}
function sAntenne() {
  const rows = [['Boulangerie Ange 🎒🚗', 'Maison des étudiants', 'Léa', ['fraise', 1], 8.4, 'livrée', 'grn'], ['Monoprix Bellecour 🎒🧊', 'Restos du Cœur Guillotière', 'Sam', ['tomate', 3], 21, 'collectée', 'blue'], ['Carrefour City Part-Dieu 🚗', 'Épicerie solidaire Gerland', '—', null, 62, 'proposée', 'org'], ['Traiteur Saveurs 🎒🧊', 'Croix-Rouge Lyon 3e', 'Inès', ['carotte', 2], 14, 'acceptée', 'turq']];
  const col = { grn: '#e4f4e1;color:#0c8a0c', blue: '#e3eefc;color:#2a78d6', org: '#fbf0dc;color:#b97600', turq: '#e0f4f7;color:#1f93a8' };
  return `<div class="desk"><div class="bar"><i></i><i></i><i></i><span style="margin-left:10px;font-size:12px;font-weight:700;color:var(--slate)">linkee.app / links-benevoles</span></div>
   <div style="display:flex;min-height:470px"><div style="width:170px;background:var(--navy2);color:#fff;padding:14px 10px;font-size:13px;font-weight:700;display:flex;flex-direction:column;gap:3px;flex:none"><div class="disp" style="font-size:22px;margin-bottom:8px">linkee</div>${['Tableau de bord', 'Planning', 'Stock', 'Distributions'].map((n) => `<div style="padding:8px 10px;border-radius:10px;opacity:.7">${n}</div>`).join('')}<div style="padding:8px 10px;border-radius:10px;background:var(--turq);color:#04262e">🎒 Links Bénévoles <span class="badge" style="background:var(--red);color:#fff;padding:1px 7px;margin-left:2px">2</span></div></div>
   <div style="flex:1;padding:16px 18px;position:relative"><div style="position:absolute;right:16px;top:12px;background:var(--navy);color:#fff;border-radius:14px;padding:9px 12px;font-size:12.5px;font-weight:800;box-shadow:0 8px 20px -6px rgba(0,0,0,.4);animation:pop .5s">🔔 Link accepté par Sam — Monoprix Bellecour</div>
   <h2 style="font-size:26px">Links Bénévoles</h2><p style="margin:2px 0 12px;font-size:13px;color:var(--slate);font-weight:600">Chaque Link apparaît ici automatiquement et remonte dans tes notifications.</p>
   <div style="display:flex;gap:10px;margin-bottom:14px">${[['4', 'Links aujourd’hui', 'var(--navy)'], ['43,4 kg', 'sauvés', 'var(--grn)'], ['3', 'Linkers actifs', 'var(--org)'], ['1', 'sans preneur', 'var(--red)']].map(([v, l, c]) => `<div class="card" style="flex:1;padding:10px 12px;border-top:4px solid ${c}"><div class="disp" style="font-size:24px">${v}</div><div style="font-size:11.5px;font-weight:800;color:var(--slate)">${l}</div></div>`).join('')}</div>
   <table class="t"><thead><tr><th>Partenaire</th><th>Destination</th><th>Linker</th><th>Poids</th><th>Statut</th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[3] ? `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:34px;height:38px;overflow:hidden;border-radius:10px;background:#efe9fb;display:inline-flex;align-items:flex-end;justify-content:center">${characterSVG(r[3][0], { stage: r[3][1], size: 34, noScale: false })}</span>${r[2]}</span>` : '—'}</td><td>${r[4]} kg</td><td><span class="badge" style="background:${col[r[6]]}">${r[5]}</span></td></tr>`).join('')}</tbody></table>
   <div style="margin-top:10px;font-size:12px;color:var(--slate);font-weight:700">Onglet branché sur la même base : partenaires, bénéficiaires, stock et historique (côté technique, à venir).</div></div></div></div>`;
}

/* ---------- shell ---------- */
const SCREENS = { intro: sIntro, signup: sSignup, profile: sProfile, home: sHome, push: sPush, map: () => sMap(), link: sLink, mission: sMission, reward: sReward, evolution: sEvolution, wardrobe: sWardrobe, shop: sShop, showroom: sShowroom, p_form: sPartnerForm, p_notif: sPartnerNotif };
function render() {
  const app = $('#app');
  const cur = S.role === 'antenne' ? 'a_tab' : S.screen;
  const center = S.role === 'antenne' ? sAntenne() : SCREENS[cur]();
  const keep = ['.content'].map((s) => { const el = document.querySelector(s); return el ? el.scrollTop : 0; })[0];
  const step = (r, [k, n], i) => `<button class="step ${(S.role === r && (S.screen === k || (k === 'map' && false))) || (r === 'antenne' && S.role === 'antenne') ? 'on' : ''}" data-a="nav" data-r="${r}" data-s="${k}"><i>${i + 1}</i>${n}</button>`;
  app.innerHTML = `<aside class="side"><h3>🥕 Links Bénévoles</h3><div style="font-size:12px;color:var(--slate);font-weight:700;margin-bottom:6px">Maquette cliquable · données fictives · aucune implémentation</div>
    <div class="grp">Espace Linker (bénévole)</div>${STEPS.linker.map((s, i) => step('linker', s, i)).join('')}<button class="step ${S.role === 'linker' && S.screen === 'showroom' ? 'on' : ''}" data-a="nav" data-r="linker" data-s="showroom"><i>★</i>Vitrine personnages & accessoires</button>
    <div class="grp">Côté partenaire</div>${STEPS.partner.map((s, i) => step('partner', s, i)).join('')}<div class="grp">Côté responsable d’antenne</div>${STEPS.antenne.map((s, i) => step('antenne', s, i)).join('')}</aside>
    <main class="stagewrap">${center}<div style="font-size:12px;font-weight:800;color:var(--slate)">${S.role === 'linker' ? 'Écran Linker' : S.role === 'partner' ? 'Espace partenaire' : 'Vue responsable d’antenne (PC)'}</div></main>
    <aside class="side dev"><h3>🛠️ Mode dev <span class="tag">preview</span></h3>
      <div class="grp">Sauter à un level</div><div class="row">${[1, 10, 20, 30, 40, 50].map((l) => `<button class="chip ${S.level === l ? 'on' : ''}" data-a="lvl" data-l="${l}">Lvl ${l}</button>`).join('')}</div>
      <input type="range" min="1" max="50" value="${S.level}" data-i="level" style="width:100%"><div id="lvl-label" style="font-size:12px;font-weight:800;margin-bottom:6px">Level ${S.level} · ${STAGES[stage()].title}</div>
      <div class="grp">Personnage</div><div class="row">${Object.keys(CH).map((k) => `<button class="chip ${S.char === k ? 'on' : ''}" data-a="dchar" data-c="${k}">${CH[k].e} ${CH[k].n}</button>`).join('')}</div>
      <div class="grp">Style de la tenue</div><div class="row">${Object.keys(STYLES).map((k) => `<button class="chip ${S.style === k ? 'on' : ''}" data-a="dstyle" data-st="${k}">${STYLES[k].e} ${STYLES[k].n.split(' ')[0]}</button>`).join('')}<button class="chip" data-a="dmix">Tenue mixte</button></div>
      <div class="grp">Profil du Linker</div><div class="row"><button class="chip ${S.mode === 'walk' ? 'on' : ''}" data-a="mode" data-m="walk">🚶 À pied</button><button class="chip ${S.mode === 'car' ? 'on' : ''}" data-a="mode" data-m="car">🚗 Voiture</button><button class="chip ${S.cold ? 'on' : ''}" data-a="cold">🧊 Frais</button></div>
      <div class="grp">Temps réel</div><div class="row"><button class="chip" data-a="steal">Un autre Linker prend un Link</button><button class="chip" data-a="unsteal">Réinitialiser</button></div>
      <div class="grp">Écrans utiles</div><div class="row"><button class="chip" data-a="evo" data-l="10">Évolution niv.10</button><button class="chip" data-a="evo" data-l="20">niv.20</button><button class="chip" data-a="evo" data-l="30">niv.30</button><button class="chip" data-a="evo" data-l="40">niv.40</button><button class="chip" data-a="evo" data-l="50">niv.50</button><button class="chip" data-a="rew">Récompense du level</button></div>
      <div style="font-size:11.5px;color:var(--slate);font-weight:700;margin-top:8px">À la vraie mise en place, ce panneau n’existera que dans l’espace superadmin (feature flag + données de démo).</div></aside>`;
  if (S.screen === 'evolution' && S.role === 'linker') playEvo();
}
let evoTimers = [];
function playEvo() {
  evoTimers.forEach(clearTimeout);
  const q = (id) => document.getElementById(id);
  if (!q('evoold')) return;
  evoTimers = [setTimeout(() => { q('evoflash')?.classList.add('go'); q('evoold')?.classList.add('go'); q('evonew')?.classList.add('go'); }, 900), setTimeout(() => { const t = q('evotext1'); if (t) t.style.opacity = 0; const t2 = q('evotext2'); if (t2) t2.style.opacity = 1; }, 4400)];
}
const toast = (t) => { S.toast = t; render(); setTimeout(() => { S.toast = ''; render(); }, 2200); };
const goTo = (s) => { S.screen = s; S.role = 'linker'; if (s === 'link') S.checked = false; render(); const c = document.querySelector('.content'); if (c) c.scrollTop = 0; };

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a, d = t.dataset;
  switch (a) {
    case 'nav': S.role = d.r; if (d.r === 'linker') { S.screen = d.s; if (d.s === 'evolution') { S.level = Math.max(S.level, 10); const st = stageOf(S.level); S.evoFrom = Math.max(0, st - 1); S.evoTo = st; } if (d.s === 'link') { S.checked = false; S.linkId = LINKS.filter(compat)[0]?.id || 'l1'; } if (d.s === 'mission') S.missionStep = 0; if (d.s === 'reward') { S.revealPick = null; } } else if (d.r === 'partner') S.partnerScreen = d.s; if (d.r === 'partner') S.screen = d.s; render(); break;
    case 'go': goTo(d.s); break;
    case 'slide': S.slide = Math.min(2, S.slide + 1); render(); break;
    case 'pickchar': S.chosenChar = d.c; render(); break;
    case 'startchar': S.char = S.chosenChar; goTo('profile'); break;
    case 'mode': if (S.mode !== d.m) S.radius = d.m === 'car' ? 20 : 4; S.mode = d.m; render(); break;
    case 'cold': S.cold = !S.cold; render(); break;
    case 'slot': { const di = +d.d, ti = +d.t; S.slots[di] = S.slots[di] || {}; S.slots[di][ti] = S.slots[di][ti] ? 0 : 1; render(); break; }
    case 'mapview': S.mapView = d.v; render(); break;
    case 'openlink': S.linkId = d.l; S.checked = false; goTo('link'); break;
    case 'call': S.calling = true; S.called = true; render(); break;
    case 'endcall': S.calling = false; render(); break;
    case 'check': S.checked = !S.checked; render(); break;
    case 'accept': S.missionStep = 0; S.weight = LINKS.find((l) => l.id === S.linkId).kg; goTo('mission'); toast('🎉 Link accepté ! Le partenaire est prévenu.'); break;
    case 'collected': S.missionStep = 1; render(); break;
    case 'wt': S.weight = Math.max(1, Math.round((S.weight + +d.d * 0.5) * 10) / 10); render(); break;
    case 'delivered': S.lastKg = S.weight; S.kgSession += S.weight; S.points += 30; if (S.level < 50) S.level++; S.revealPick = null; S.missionStep = 2; S.xp = 30; goTo('reward'); break;
    case 'pickstyle': S.revealPick = d.st; render(); break;
    case 'equipnew': { S.chosen[S.level] = S.revealPick || S.chosen[S.level]; delete S.equipped[(S.level - 1) % 10]; S.revealPick = null; if (S.level % 10 === 0) { const st = stage(); S.evoFrom = Math.max(0, st - 1); S.evoTo = st; goTo('evolution'); } else goTo('home'); break; }
    case 'replayevo': render(); break;
    case 'wcat': S.wardCat = +d.c; render(); break;
    case 'equip': S.equipped[+d.c] = +d.l; render(); break;
    case 'unequip': S.equipped[+d.c] = 'none'; render(); break;
    case 'shoptab': S.shopTab = d.t; render(); break;
    case 'buy': { const k = d.k, v = k === 'color' ? +d.v : d.v, p = +d.p, own = S.shop.owned[k]; if (!own[v]) { if (S.points < p) { toast('Pas assez de points 🪙'); break; } S.points -= p; own[v] = 1; } S.shop[k] = S.shop[k] === v ? (k === 'color' ? 0 : '') : v; render(); break; }
    case 'lvl': S.level = +d.l; render(); break;
    case 'dchar': S.char = d.c; render(); break;
    case 'dstyle': S.style = d.st; S.chosen = {}; render(); break;
    case 'dmix': { const ks = Object.keys(STYLES); S.chosen = {}; for (let l = 1; l <= 50; l++) S.chosen[l] = ks[(l * 7) % 3]; render(); break; }
    case 'steal': { const v = LINKS.filter(compat)[0]; if (v) { S.gone[v.id] = 1; if (S.screen === 'link' && S.linkId === v.id) S.screen = 'map'; render(); toast('⚡ ' + v.p + ' vient d’être pris par un autre Linker'); } break; }
    case 'unsteal': S.gone = {}; render(); break;
    case 'evo': { S.level = +d.l; const st = stageOf(S.level); S.evoFrom = Math.max(0, st - 1); S.evoTo = st; S.role = 'linker'; S.screen = 'evolution'; render(); break; }
    case 'rew': S.revealPick = null; S.role = 'linker'; S.screen = 'reward'; render(); break;
    case 'showtab': S.show.tab = d.t; render(); break;
    case 'showchar': S.char = d.c; render(); break;
    case 'showstyle': S.show.style = d.st; render(); break;
    case 'showfull': S.show.full = !S.show.full; render(); break;
    case 'showcat': S.show.cat = +d.c; render(); break;
    case 'pft': S.pf[d.k] = !S.pf[d.k]; render(); break;
    case 'pfm': S.pf.modeP = d.m; render(); break;
    case 'pfsend': S.pf.sent = true; render(); break;
  }
});
document.addEventListener('input', (e) => {
  const i = e.target.dataset.i;
  if (!i) return;
  const v = e.target.value;
  if (i === 'name') S.name = v;
  // sliders must not rebuild the page while being dragged: update labels live, rebuild on release ('change')
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  if (i === 'radius') { S.radius = +v; const ty = typology(S.mode, S.radius); set('ty-r', S.radius + ' km'); set('ty-t', ty.t); set('ty-e', ty.e); set('ty-s', 'Rayon de ' + S.radius + ' km · ' + (S.mode === 'walk' ? '25 kg max' : '80 kg max')); }
  if (i === 'level') { S.level = +v; set('lvl-label', 'Level ' + S.level + ' · ' + STAGES[stage()].title); }
  if (i === 'pfvol') { S.pf.vol = +v; set('pf-vol', v + ' kg'); }
  if (i === 'pffrom') { S.pf.from = v; }
  if (i === 'pfto') { S.pf.to = v; }
});
document.addEventListener('change', (e) => {
  const i = e.target.dataset.i;
  if (i && ['radius', 'level', 'pfvol', 'pffrom', 'pfto'].includes(i)) render();
});
render();
