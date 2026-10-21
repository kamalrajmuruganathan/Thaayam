import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Path, Circle, G, Ellipse, Line, Polyline, Defs, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { geometrie, pionsParCase, pionsAuCentre, zoneCase, arcsCroix, angleVue } from '../../moteur/partie.js';
import { cle } from '../../moteur/plateau.js';
import { themePlateau } from '../../moteur/themes.js';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './ui';

const S = 100;

// Cadre du plateau selon le thème : chrome (Cristal), néon (Nuit), or (Temple)
const CADRES = { cristal: '#aab6c0', nuit: '#ff4fd8', temple: '#d9a520' };

/**
 * Plateau (croix ou carré) ; `coups` = coups jouables, `surPion(pion)` quand on touche un pion jouable.
 * enMouvement : { joueur, pion } du pion qui avance (dessiné plus gros) ; eclat : { k, couleur } (case qui s'illumine).
 */
export function Plateau({ etat, coups, surPion, largeur, trajetDe = null, enMouvement = null, eclat = null, vue = null }) {
  const nomTheme = useTheme();
  const T = themePlateau(nomTheme);
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
    if (croix) ch.slice(0, g.debutBoucle + 1).forEach((p) => teintes.set(cle(p), j.couleur));
  });

  const cases = [];
  g.cases.forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    if (!croix && r === g.centre.r && c === g.centre.c) return;
    const x = c * S;
    const y = r * S;
    const teinte = teintes.get(k);
    cases.push(<Rect key={`c${k}`} x={x + 2} y={y + 2} width={S - 4} height={S - 4} rx={6} fill={T.caseFond} stroke={T.caseTrait} strokeWidth={3} />);
    if (teinte) cases.push(<Rect key={`t${k}`} x={x + 2} y={y + 2} width={S - 4} height={S - 4} rx={6} fill={teinte} fillOpacity={T.teinteOpacite} />);
    if (g.refuges.has(k)) {
      cases.push(
        <Path key={`x${k}`} d={`M${x + 14} ${y + 14}L${x + S - 14} ${y + S - 14}M${x + S - 14} ${y + 14}L${x + 14} ${y + S - 14}`}
          stroke={teinte || T.croixRefuge} strokeWidth={7} strokeLinecap="round" opacity={teinte ? 0.95 : 0.6} />
      );
    }
  });

  const ct = zone(cle(g.chemins[0][g.arrivee]));
  const centre = (
    <G>
      <Rect x={ct.x + 2} y={ct.y + 2} width={ct.w - 4} height={ct.w - 4} rx={8} fill={croix ? T.centreFond : '#c98b3c'} stroke={T.centreTrait} strokeWidth={3} />
      <Path
        d={croix
          ? `M${ct.x + 6} ${ct.y + 6}L${ct.x + ct.w - 6} ${ct.y + ct.w - 6}M${ct.x + ct.w - 6} ${ct.y + 6}L${ct.x + 6} ${ct.y + ct.w - 6}`
          : `M${ct.x + 50} ${ct.y + 14}L${ct.x + 86} ${ct.y + 50}L${ct.x + 50} ${ct.y + 86}L${ct.x + 14} ${ct.y + 50}Z`}
        fill="none" stroke={croix ? T.centreCroix : '#fff3da'} strokeWidth={croix ? 3 : 4} opacity={0.8} />
    </G>
  );

  const dernier = etat.dernierCoup ? (() => {
    const z = zone(cle(g.chemins[etat.dernierCoup.joueur][etat.dernierCoup.vers]));
    return <Rect x={z.x + 6} y={z.y + 6} width={z.w - 12} height={z.w - 12} rx={8} fill="none"
      stroke={T.dernierCoup || etat.joueurs[etat.dernierCoup.joueur].couleur} strokeWidth={5} opacity={0.8} />;
  })() : null;

  // Trajet d'un joueur (aide) : ligne pointillée
  const trajet = trajetDe === null ? null : (
    <Polyline
      points={g.chemins[trajetDe].map((p) => { const z = zone(cle(p)); return `${z.x + z.w / 2},${z.y + z.w / 2}`; }).join(' ')}
      fill="none" stroke={etat.joueurs[trajetDe].couleur} strokeWidth={8} strokeDasharray="4 14" strokeLinecap="round" opacity={0.85} />
  );

  // Le décor (diagonales, arcs, cases, centre, trajet) ne change pas pendant la partie : React le garde tel quel,
  // seuls les pions sont redessinés (plus fluide sur téléphone).
  const cleDecor = JSON.stringify([nomTheme, g.forme, n, etat.joueurs.map((j) => j.couleur), trajetDe]);
  const decor = useMemo(() => (
    <G>
      {croix ? diagonales(g, n, T) : null}
      {cases}
      {centre}
      {trajet}
    </G>
  ), [cleDecor]); // eslint-disable-line react-hooks/exhaustive-deps

  const cibles = coups.map((cp) => {
    const z = zone(cle(g.chemins[etat.tour][cp.vers]));
    return (
      <Circle key={`d${cp.pion}`} cx={z.x + z.w / 2} cy={z.y + z.w / 2} r={z.w / 2 - 10} fill="none"
        stroke={etat.joueurs[etat.tour].couleur} strokeWidth={5} strokeDasharray="10 8" />
    );
  });

  const pions = [];
  // Plateau en croix : pions à la maison et pions arrivés dessinés dans le centre
  const auCentre = pionsAuCentre(g, etat, S);
  const cleCentre = cle(g.chemins[0][g.arrivee]);
  const entree = coups.find((c) => c.depuis === -1 && !c.groupe);
  auCentre.forEach((p) => {
    const jouable = !p.arrive && !!entree && p.joueur === etat.tour;
    pions.push(
      <G key={`m${p.joueur}-${p.pion}`} onPress={jouable ? () => surPion(entree.pion) : undefined}>
        {jouable ? <Circle cx={p.cx} cy={p.cy} r={Math.max(p.r + 8, 40)} fill="#ffffff" fillOpacity={0.45} /> : null}
        {p.arrive ? <Circle cx={p.cx} cy={p.cy} r={p.r + 6} fill={T.arrive} stroke={T.arriveTrait} strokeWidth={2} /> : null}
        <Circle cx={p.cx} cy={p.cy} r={p.r} fill={etat.joueurs[p.joueur].couleur}
          stroke={jouable ? T.jouable : T.pionTrait} strokeWidth={jouable ? 5 : 2.5} />
        <Circle cx={p.cx - p.r * 0.3} cy={p.cy - p.r * 0.3} r={p.r * 0.3} fill="#ffffff" opacity={0.35} />
      </G>
    );
  });
  pionsParCase(etat).forEach((liste, k) => {
    if (auCentre.length && k === cleCentre) return;
    const z = zone(k);
    const cote = Math.ceil(Math.sqrt(liste.length));
    const pas = (z.w - 16) / cote;
    const rayon = Math.min(38, pas * 0.45);
    liste.forEach((p, i) => {
      const cx = z.x + 8 + pas * (i % cote) + pas / 2;
      const cy = z.y + 8 + pas * Math.floor(i / cote) + pas / 2;
      const jouable = p.joueur === etat.tour && jouables.has(p.pion);
      const bouge = enMouvement && enMouvement.joueur === p.joueur && enMouvement.pion === p.pion;
      const r = bouge ? rayon * 1.22 : rayon;
      pions.push(
        <G key={`p${p.joueur}-${p.pion}`} onPress={jouable ? () => surPion(p.pion) : undefined}>
          {jouable ? <Circle cx={cx} cy={cy} r={Math.max(rayon + 10, 60)} fill="#ffffff" fillOpacity={0.45} /> : null}
          {bouge ? <Circle cx={cx + 4} cy={cy + 8} r={r} fill="#000000" opacity={0.3} /> : null}
          <Circle cx={cx} cy={bouge ? cy - 6 : cy} r={r} fill={etat.joueurs[p.joueur].couleur}
            stroke={jouable ? T.jouable : T.pionTrait} strokeWidth={jouable ? 6 : 3} />
          <Circle cx={cx - r * 0.3} cy={(bouge ? cy - 6 : cy) - r * 0.3} r={r * 0.3} fill="#ffffff" opacity={0.35} />
        </G>
      );
    });
  });

  // Éclat d'une capture ou d'une arrivée
  const zoneEclat = eclat ? zone(eclat.k) : null;
  const halo = eclat ? (
    <G>
      <Circle cx={zoneEclat.x + zoneEclat.w / 2} cy={zoneEclat.y + zoneEclat.w / 2} r={zoneEclat.w * 0.62} fill={eclat.couleur} opacity={0.25} />
      <Circle cx={zoneEclat.x + zoneEclat.w / 2} cy={zoneEclat.y + zoneEclat.w / 2} r={zoneEclat.w * 0.55} fill="none" stroke={eclat.couleur} strokeWidth={10} opacity={0.9} />
    </G>
  ) : null;

  const fin = CADRES[nomTheme] ? (nomTheme === 'temple' ? 5 : 3) : 8;
  const couleurHalo = nomTheme === 'nuit' ? '#ff4fd8' : '#5fd4ff';
  return (
    <View style={{ alignItems: 'center' }}>
    <View style={{ backgroundColor: CADRES[nomTheme] || T.cadre, padding: fin, borderRadius: 16,
      shadowColor: couleurHalo, shadowOpacity: T.lueur ? 0.45 : 0, shadowRadius: 18, elevation: T.lueur ? 8 : 0 }}>
      <Svg width={largeur - 2 * fin} height={largeur - 2 * fin} viewBox={`0 0 ${n * S} ${n * S}`}>
        {T.fondLueur ? (
          <Defs>
            <RadialGradient id="fondLueur" cx="50%" cy="50%" r="60%">
              <Stop offset="0%" stopColor={T.fondLueur} />
              <Stop offset="100%" stopColor={T.fond} />
            </RadialGradient>
          </Defs>
        ) : null}
        {croix ? <Rect x={0} y={0} width={n * S} height={n * S} rx={24} fill={T.fondLueur ? 'url(#fondLueur)' : T.fond} /> : null}
        <G transform={`rotate(${angleVue(g, vue)} ${(n * S) / 2} ${(n * S) / 2})`}>
        {decor}
        {dernier}
        {cibles}
        {pions}
        {halo}
        </G>
        {croix ? ecritures(n, T) : null}
      </Svg>
    </View>
    {/* Sol brillant : reflet lumineux sous le plateau */}
    {T.lueur ? (
      <LinearGradient colors={[`${couleurHalo}55`, `${couleurHalo}00`]} style={{ width: largeur * 0.92, height: 22, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 }} />
    ) : null}
    </View>
  );
}

/** Diagonales : des coins du plateau jusqu'au centre, à travers les cases de coin. */
function diagonales(g, n, T) {
  const { r: r0, c: c0, taille: t } = g.centre;
  const coins = [[0, 0, c0, r0], [n, 0, c0 + t, r0], [0, n, c0, r0 + t], [n, n, c0 + t, r0 + t]];
  return [
    ...coins.map(([x1, y1, x2, y2], i) => (
      <G key={`diag${i}`}>
        <Line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke={T.diagonale} strokeWidth={10} strokeLinecap="round" />
        <Line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke={T.diagonaleLueur} strokeWidth={3} opacity={0.7} />
      </G>
    )),
    // 3 arcs à chaque coin du centre : passage d'un bras au suivant
    ...arcsCroix(g, S).map((d, i) => (
      <G key={`arc${i}`}>
        <Path d={d} fill="none" stroke={T.arc} strokeWidth={7} strokeLinecap="round" />
        <Path d={d} fill="none" stroke={T.arcLueur} strokeWidth={2.5} opacity={0.85} />
      </G>
    )),
  ];
}

/** Écriture tamoule dans les coins du haut (jamais tournée, toujours lisible). */
function ecritures(n, T) {
  return [['தாயம்', 2.4], ['விளையாட்டு', n - 2.4]].map(([texte, cx]) => (
    <SvgText key={texte} x={cx * S} y={0.62 * S} textAnchor="middle" fontSize={0.48 * S} fontWeight="700" fill={T.ecriture} opacity={0.9}>
      {texte}
    </SvgText>
  ));
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
