import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Path, Circle, G, Ellipse, Line, Polyline } from 'react-native-svg';
import { geometrie, pionsParCase, zoneCase } from '../../moteur/partie.js';
import { cle } from '../../moteur/plateau.js';

const S = 100;

/** Plateau (croix ou carré) ; `coups` = coups jouables, `surPion(pion)` quand on touche un pion jouable. */
export function Plateau({ etat, coups, surPion, largeur, trajetDe = null }) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const n = g.n;
  const zone = zoneCase(g, S);
  const croix = g.forme === 'croix';
  const jouables = new Set(coups.filter((c) => c.depuis >= 0).map((c) => c.pion));

  // Couleur de chaque joueur : sa case de départ, sa colonne d'arrivée (croix) et ses croix
  const teintes = new Map();
  etat.joueurs.forEach((j, i) => {
    const ch = g.chemins[i];
    teintes.set(cle(ch[0]), j.couleur);
    if (croix) ch.slice(g.longueurExterieur + 1, g.arrivee).forEach((p) => teintes.set(cle(p), j.couleur));
  });

  const cases = [];
  g.cases.forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    if (!croix && r === g.centre.r && c === g.centre.c) return;
    const x = c * S;
    const y = r * S;
    const teinte = teintes.get(k);
    cases.push(<Rect key={`c${k}`} x={x + 2} y={y + 2} width={S - 4} height={S - 4} rx={6} fill="#f8e9c8" stroke="#4a2a12" strokeWidth={3} />);
    if (teinte) cases.push(<Rect key={`t${k}`} x={x + 2} y={y + 2} width={S - 4} height={S - 4} rx={6} fill={teinte} fillOpacity={0.3} />);
    if (g.refuges.has(k)) {
      cases.push(
        <Path key={`x${k}`} d={`M${x + 14} ${y + 14}L${x + S - 14} ${y + S - 14}M${x + S - 14} ${y + 14}L${x + 14} ${y + S - 14}`}
          stroke={teinte || '#6b3a14'} strokeWidth={7} strokeLinecap="round" opacity={teinte ? 0.95 : 0.6} />
      );
    }
  });

  const ct = zone(cle(g.chemins[0][g.arrivee]));
  const centre = (
    <G>
      <Rect x={ct.x + 2} y={ct.y + 2} width={ct.w - 4} height={ct.w - 4} rx={8} fill={croix ? '#fbf3e2' : '#c98b3c'} stroke="#4a2a12" strokeWidth={3} />
      <Path
        d={croix
          ? `M${ct.x + 6} ${ct.y + 6}L${ct.x + ct.w - 6} ${ct.y + ct.w - 6}M${ct.x + ct.w - 6} ${ct.y + 6}L${ct.x + 6} ${ct.y + ct.w - 6}`
          : `M${ct.x + 50} ${ct.y + 14}L${ct.x + 86} ${ct.y + 50}L${ct.x + 50} ${ct.y + 86}L${ct.x + 14} ${ct.y + 50}Z`}
        fill="none" stroke={croix ? '#4a2a12' : '#fff3da'} strokeWidth={croix ? 3 : 4} opacity={0.8} />
    </G>
  );

  const dernier = etat.dernierCoup ? (() => {
    const z = zone(cle(g.chemins[etat.dernierCoup.joueur][etat.dernierCoup.vers]));
    return <Rect x={z.x + 6} y={z.y + 6} width={z.w - 12} height={z.w - 12} rx={8} fill="none"
      stroke={etat.joueurs[etat.dernierCoup.joueur].couleur} strokeWidth={5} opacity={0.8} />;
  })() : null;

  // Trajet d'un joueur (aide) : ligne pointillée
  const trajet = trajetDe === null ? null : (
    <Polyline
      points={g.chemins[trajetDe].map((p) => { const z = zone(cle(p)); return `${z.x + z.w / 2},${z.y + z.w / 2}`; }).join(' ')}
      fill="none" stroke={etat.joueurs[trajetDe].couleur} strokeWidth={8} strokeDasharray="4 14" strokeLinecap="round" opacity={0.85} />
  );

  const cibles = coups.map((cp) => {
    const z = zone(cle(g.chemins[etat.tour][cp.vers]));
    return (
      <Circle key={`d${cp.pion}`} cx={z.x + z.w / 2} cy={z.y + z.w / 2} r={z.w / 2 - 10} fill="none"
        stroke={etat.joueurs[etat.tour].couleur} strokeWidth={5} strokeDasharray="10 8" />
    );
  });

  const pions = [];
  pionsParCase(etat).forEach((liste, k) => {
    const z = zone(k);
    const cote = Math.ceil(Math.sqrt(liste.length));
    const pas = (z.w - 16) / cote;
    const rayon = Math.min(38, pas * 0.45);
    liste.forEach((p, i) => {
      const cx = z.x + 8 + pas * (i % cote) + pas / 2;
      const cy = z.y + 8 + pas * Math.floor(i / cote) + pas / 2;
      const jouable = p.joueur === etat.tour && jouables.has(p.pion);
      pions.push(
        <G key={`p${p.joueur}-${p.pion}`} onPress={jouable ? () => surPion(p.pion) : undefined}>
          {jouable ? <Circle cx={cx} cy={cy} r={Math.max(rayon + 10, 60)} fill="#ffffff" fillOpacity={0.45} /> : null}
          <Circle cx={cx} cy={cy} r={rayon} fill={etat.joueurs[p.joueur].couleur}
            stroke={jouable ? '#ffffff' : '#2b1d10'} strokeWidth={jouable ? 6 : 3} />
          <Circle cx={cx - rayon * 0.3} cy={cy - rayon * 0.3} r={rayon * 0.3} fill="#ffffff" opacity={0.35} />
        </G>
      );
    });
  });

  return (
    <View style={{ backgroundColor: '#6b3a14', padding: 8, borderRadius: 14 }}>
      <Svg width={largeur - 16} height={largeur - 16} viewBox={`0 0 ${n * S} ${n * S}`}>
        {croix ? <Rect x={0} y={0} width={n * S} height={n * S} rx={24} fill="#b8653a" /> : null}
        {croix ? diagonales(g, n) : null}
        {cases}
        {centre}
        {trajet}
        {dernier}
        {cibles}
        {pions}
      </Svg>
    </View>
  );
}

/** Diagonales : des coins du plateau jusqu'au centre, à travers les cases de coin. */
function diagonales(g, n) {
  const { r: r0, c: c0, taille: t } = g.centre;
  const coins = [[0, 0, c0, r0], [n, 0, c0 + t, r0], [0, n, c0, r0 + t], [n, n, c0 + t, r0 + t]];
  return [
    ...coins.map(([x1, y1, x2, y2], i) => (
      <G key={`diag${i}`}>
        <Line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke="#5a2e10" strokeWidth={10} strokeLinecap="round" />
        <Line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke="#e9b77f" strokeWidth={3} opacity={0.7} />
      </G>
    )),
  ];
}

export function Cauri({ ouvert }) {
  return (
    <Svg width={28} height={38} viewBox="0 0 30 40">
      {ouvert ? (
        <>
          <Ellipse cx={15} cy={20} rx={13} ry={18} fill="#f4ead5" stroke="#8a6a3b" strokeWidth={2} />
          <Path d="M15 6 Q11 20 15 34 Q19 20 15 6" fill="#5b3a1a" />
          <Path d="M12 12h-3M12 17h-4M12 22h-4M12 27h-3M18 12h3M18 17h4M18 22h4M18 27h3" stroke="#8a6a3b" strokeWidth={1.2} />
        </>
      ) : (
        <>
          <Ellipse cx={15} cy={20} rx={13} ry={18} fill="#d8b98a" stroke="#8a6a3b" strokeWidth={2} />
          <Ellipse cx={13} cy={15} rx={5} ry={7} fill="#f2dfbd" opacity={0.7} />
        </>
      )}
    </Svg>
  );
}
