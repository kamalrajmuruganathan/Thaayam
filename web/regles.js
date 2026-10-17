// Page « Règles du jeu » : les dessins sont faits à partir du moteur du jeu.
import { geometrie, zoneCase, arcsCroix } from './moteur/partie.js';
import { REGLES_PAR_DEFAUT, COULEURS, valeurDesLongs, faitRejouer } from './moteur/regles.js';
import { cle } from './moteur/plateau.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 100;
const g = geometrie(REGLES_PAR_DEFAUT, 4);
const zone = zoneCase(g, S);
const milieu = (p) => { const z = zone(cle(p)); return [z.x + z.w / 2, z.y + z.w / 2]; };

function svg(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (parent) parent.append(e);
  return e;
}

function texte(parent, x, y, contenu, attrs = {}) {
  const t = svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-weight': 700,
    'font-family': 'system-ui, sans-serif', ...attrs }, parent);
  t.textContent = contenu;
  return t;
}

/** Plateau en croix vide, avec la colonne d'arrivée de chaque joueur à sa couleur. */
function plateau(idSvg, legende) {
  const n = g.n;
  const p = document.getElementById(idSvg);
  p.setAttribute('viewBox', `0 0 ${n * S} ${n * S}`);
  p.setAttribute('role', 'img');
  p.setAttribute('aria-label', legende);
  const teintes = new Map();
  for (let i = 0; i < 4; i++) {
    const ch = g.chemins[i];
    teintes.set(cle(ch[0]), COULEURS[i].code);
    ch.slice(0, g.debutBoucle + 1).forEach((q) => teintes.set(cle(q), COULEURS[i].code));
  }
  svg('rect', { x: 0, y: 0, width: n * S, height: n * S, rx: 24, fill: '#b8653a' }, p);
  const { r: r0, c: c0, taille: t } = g.centre;
  [[0, 0, c0, r0], [n, 0, c0 + t, r0], [0, n, c0, r0 + t], [n, n, c0 + t, r0 + t]].forEach(([x1, y1, x2, y2]) => {
    svg('line', { x1: x1 * S, y1: y1 * S, x2: x2 * S, y2: y2 * S, stroke: '#5a2e10', 'stroke-width': 10, 'stroke-linecap': 'round' }, p);
  });
  arcsCroix(g, S).forEach((d) => svg('path', { d, fill: 'none', stroke: '#5a2e10', 'stroke-width': 7, 'stroke-linecap': 'round' }, p));
  g.cases.forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    svg('rect', { x: c * S + 2, y: r * S + 2, width: S - 4, height: S - 4, rx: 6, fill: '#f8e9c8', stroke: '#4a2a12', 'stroke-width': 3 }, p);
    if (teintes.has(k)) svg('rect', { x: c * S + 2, y: r * S + 2, width: S - 4, height: S - 4, rx: 6, fill: teintes.get(k), 'fill-opacity': 0.3 }, p);
  });
  const ct = zone(cle(g.chemins[0][g.arrivee]));
  svg('rect', { x: ct.x + 2, y: ct.y + 2, width: ct.w - 4, height: ct.w - 4, rx: 8, fill: '#fbf3e2', stroke: '#4a2a12', 'stroke-width': 3 }, p);
  svg('path', { d: `M${ct.x + 6} ${ct.y + 6}L${ct.x + ct.w - 6} ${ct.y + ct.w - 6}M${ct.x + ct.w - 6} ${ct.y + 6}L${ct.x + 6} ${ct.y + ct.w - 6}`,
    stroke: '#4a2a12', 'stroke-width': 3, opacity: 0.5 }, p);
  return p;
}

function pion(p, joueur, pos, nombre = 1, decalage = [0, 0]) {
  const [x, y] = milieu(g.chemins[joueur][pos]);
  const cx = x + decalage[0], cy = y + decalage[1];
  if (nombre > 1) svg('circle', { cx: cx + 8, cy: cy - 8, r: 34, fill: COULEURS[joueur].code, stroke: '#2b1d10', 'stroke-width': 4 }, p);
  svg('circle', { cx, cy, r: 34, fill: COULEURS[joueur].code, stroke: '#2b1d10', 'stroke-width': 4 }, p);
  if (nombre > 1) texte(p, cx, cy, `×${nombre}`, { 'font-size': 30, fill: '#fff' });
}

function fleche(p, de, a, couleur, id) {
  const defs = svg('defs', {}, p);
  const m = svg('marker', { id, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto' }, defs);
  svg('path', { d: 'M0 0L10 5L0 10Z', fill: couleur }, m);
  // La flèche s'arrête au bord de la dernière case, pour ne pas cacher ce qui s'y trouve.
  const pts = [de, ...a].map(milieu);
  const [x1, y1] = pts[pts.length - 2], [x2, y2] = pts[pts.length - 1];
  const L = Math.hypot(x2 - x1, y2 - y1);
  pts[pts.length - 1] = [x2 - ((x2 - x1) / L) * 50, y2 - ((y2 - y1) / L) * 50];
  svg('polyline', { points: pts.map((q) => q.join(',')).join(' '), fill: 'none', stroke: couleur,
    'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'marker-end': `url(#${id})`, opacity: 0.85 }, p);
}

// 1. Le plateau : un pion de chaque couleur sur sa case d'entrée
{
  const p = plateau('dessin-plateau', 'Plateau en croix avec les 4 couleurs');
  for (let i = 0; i < 4; i++) pion(p, i, 0);
}

// 2. Le trajet du pion rouge, numéroté pas à pas (sa colonne est parcourue deux fois)
{
  const p = plateau('dessin-trajet', `Trajet complet du pion rouge, de 0 à ${g.arrivee}`);
  const ch = g.chemins[0];
  svg('polyline', { points: ch.map((q) => milieu(q).join(',')).join(' '), fill: 'none', stroke: COULEURS[0].code,
    'stroke-width': 7, 'stroke-dasharray': '4 12', 'stroke-linecap': 'round', opacity: 0.7 }, p);
  const pas = new Map(); // case → numéros des pas
  ch.forEach((q, i) => { const k = cle(q); pas.set(k, [...(pas.get(k) || []), i]); });
  pas.forEach((liste, k) => {
    const [x, y] = milieu(k.split(',').map(Number));
    const colonne = liste[0] <= g.debutBoucle || liste[0] >= g.longueurExterieur;
    const etiquette = liste.join('/');
    svg('circle', { cx: x, cy: y, r: liste[0] === g.arrivee ? 40 : 32, fill: colonne ? COULEURS[0].code : '#fffaf1', stroke: COULEURS[0].code, 'stroke-width': 4 }, p);
    texte(p, x, y, etiquette, { 'font-size': etiquette.length > 3 ? 21 : 30, fill: colonne ? '#fff' : '#2b1d10' });
  });
}

// 3. Manger un groupe : Vert tombe sur 2 pions rouges empilés
{
  const p = plateau('dessin-groupe', 'Le pion vert tombe sur deux pions rouges empilés et les mange tous les deux');
  const cible = g.chemins[0][25];
  const iVert = g.chemins[1].findIndex((q) => cle(q) === cle(cible));
  pion(p, 0, 25, 2);
  pion(p, 1, iVert - 4);
  fleche(p, g.chemins[1][iVert - 4], g.chemins[1].slice(iVert - 3, iVert + 1), COULEURS[1].code, 'fleche-vert');
}

// 4. Les dés : les 4 faces et les 16 lancers
function deLong(points) {
  const d = document.createElement('div');
  d.className = 'de-long';
  d.setAttribute('aria-label', `face ${points}`);
  for (let i = 0; i < points; i++) { const s = document.createElement('span'); s.className = 'point'; d.append(s); }
  return d;
}
{
  const faces = document.getElementById('faces');
  REGLES_PAR_DEFAUT.des.faces.forEach((f) => {
    const fig = document.createElement('figure');
    fig.append(deLong(f));
    const c = document.createElement('figcaption');
    c.textContent = f === 0 ? 'vide' : `${f} point${f > 1 ? 's' : ''}`;
    fig.append(c);
    faces.append(fig);
  });
  const corps = document.querySelector('#tableau-des tbody');
  const F = REGLES_PAR_DEFAUT.des.faces;
  F.forEach((a) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.append(deLong(a));
    tr.append(th);
    F.forEach((b) => {
      const td = document.createElement('td');
      const tirage = { valeur: valeurDesLongs(REGLES_PAR_DEFAUT.des, [a, b]), detail: [a, b] };
      const kaapal = tirage.valeur === 0;
      td.textContent = kaapal ? 'Kaapal' : String(tirage.valeur);
      if (kaapal) td.className = 'kaapal';
      else if (REGLES_PAR_DEFAUT.valeursEntree.includes(tirage.valeur)) td.className = 'entree';
      else if (faitRejouer(REGLES_PAR_DEFAUT, tirage)) td.className = 'rejoue';
      tr.append(td);
    });
    corps.append(tr);
  });
}
