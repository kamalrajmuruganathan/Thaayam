import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Path, Circle, G, Ellipse } from 'react-native-svg';
import { geometrie, pionsParCase } from '../../moteur/partie.js';
import { cle } from '../../moteur/plateau.js';

const S = 100;

/** Plateau carré ; `coups` = coups jouables, `surPion(pion)` quand on touche un pion jouable. */
export function Plateau({ etat, coups, surPion, largeur }) {
  const n = etat.regles.taille;
  const g = geometrie(etat.regles, etat.joueurs.length);
  const m = (n - 1) / 2;
  const departs = new Map();
  etat.joueurs.forEach((j, i) => departs.set(cle(g.chemins[i][0]), j.couleur));
  const jouables = new Set(coups.filter((c) => c.depuis >= 0).map((c) => c.pion));

  const cases = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = `${r},${c}`;
      const x = c * S;
      const y = r * S;
      const centre = r === m && c === m;
      cases.push(
        <Rect key={`c${k}`} x={x + 2} y={y + 2} width={S - 4} height={S - 4} rx={6}
          fill={centre ? '#c98b3c' : departs.get(k) || '#f8e9c8'}
          fillOpacity={departs.has(k) && !centre ? 0.35 : 1} stroke="#6b3a14" strokeWidth={2} />
      );
      if (g.refuges.has(k) && !centre) {
        cases.push(
          <Path key={`x${k}`} d={`M${x + 18} ${y + 18}L${x + S - 18} ${y + S - 18}M${x + S - 18} ${y + 18}L${x + 18} ${y + S - 18}`}
            stroke="#6b3a14" strokeWidth={4} strokeLinecap="round" opacity={0.55} />
        );
      }
      if (centre) {
        cases.push(
          <Path key="centre" d={`M${x + 50} ${y + 14}L${x + 86} ${y + 50}L${x + 50} ${y + 86}L${x + 14} ${y + 50}Z`}
            fill="none" stroke="#fff3da" strokeWidth={4} />
        );
      }
    }
  }

  const cibles = coups.map((cp) => {
    const [r, c] = g.chemins[etat.tour][cp.vers];
    return (
      <Circle key={`d${cp.pion}`} cx={c * S + 50} cy={r * S + 50} r={40} fill="none"
        stroke={etat.joueurs[etat.tour].couleur} strokeWidth={5} strokeDasharray="10 8" />
    );
  });

  const pions = [];
  pionsParCase(etat).forEach((liste, k) => {
    const [r, c] = k.split(',').map(Number);
    const cote = Math.ceil(Math.sqrt(liste.length));
    const pas = (S - 16) / cote;
    const rayon = Math.min(30, pas * 0.42);
    liste.forEach((p, i) => {
      const cx = c * S + 8 + pas * (i % cote) + pas / 2;
      const cy = r * S + 8 + pas * Math.floor(i / cote) + pas / 2;
      const jouable = p.joueur === etat.tour && jouables.has(p.pion);
      pions.push(
        <G key={`p${p.joueur}-${p.pion}`} onPress={jouable ? () => surPion(p.pion) : undefined}>
          {jouable ? <Circle cx={cx} cy={cy} r={Math.max(rayon + 8, 36)} fill="#ffffff" fillOpacity={0.55} /> : null}
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
        {cases}
        {cibles}
        {pions}
      </Svg>
    </View>
  );
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
