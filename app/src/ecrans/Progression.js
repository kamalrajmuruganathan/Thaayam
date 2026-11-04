import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgTexte } from 'react-native-svg';
import { Bouton, Carte, Texte, useCouleurs, useT } from '../ui';
import { niveauDe, rangDe, etatDefis, TROPHEES } from '../../../moteur/progression.js';

/** Barre de progression (XP, défis). */
function Barre({ part, couleur }) {
  const c = useCouleurs();
  return (
    <View style={{ height: 10, borderRadius: 6, backgroundColor: `${c.accent}26`, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.max(2, Math.round(100 * part))}%`, borderRadius: 6, backgroundColor: couleur || c.accent }} />
    </View>
  );
}

/** Niveau, barre d'XP, rang et cote (accueil et écran « Ma progression »). */
export function ResumeProgression({ progression: p }) {
  const c = useCouleurs();
  const t = useT();
  if (!p || !p.parties) return <Texte attenue>{t('progAucune')}</Texte>;
  const nv = niveauDe(p.xp);
  const rg = rangDe(p.cote);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Texte style={{ fontSize: 20, fontWeight: '800', color: c.accent }}>{t('progNiveau', { n: nv.niveau })}</Texte>
        <Texte style={{ fontWeight: '700' }}>{rg.icone} {t(rg.cle)} · {t('progCote', { c: p.cote })}</Texte>
      </View>
      <Barre part={nv.xpDansNiveau / nv.xpPourSuivant} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Texte attenue style={{ fontSize: 12 }}>{t('progXp', { x: nv.xpDansNiveau, y: nv.xpPourSuivant })}</Texte>
        {rg.suivant ? <Texte attenue style={{ fontSize: 12 }}>{t('progRangSuivant', { n: rg.manque, rang: t(rg.suivant.cle) })}</Texte> : null}
      </View>
    </View>
  );
}

/** Courbe de la cote, partie après partie. */
function Courbe({ historique, largeur }) {
  const c = useCouleurs();
  const pts = [1000, ...historique.map((h) => h.c)];
  const L = largeur; const H = 150; const m = 34;
  const min = Math.min(...pts) - 20; const max = Math.max(...pts) + 20;
  const x = (i) => m + ((L - m - 8) * i) / Math.max(1, pts.length - 1);
  const y = (v) => 8 + ((H - 24) * (max - v)) / (max - min);
  const reperes = [max - 20, Math.round((max + min) / 2), min + 20];
  return (
    <Svg width={L} height={H}>
      {reperes.map((v) => (
        <React.Fragment key={v}>
          <Line x1={m} x2={L - 4} y1={y(v)} y2={y(v)} stroke={c.texte} strokeOpacity={0.15} />
          <SvgTexte x={2} y={y(v) + 4} fill={c.attenue} fontSize={10}>{String(Math.round(v))}</SvgTexte>
        </React.Fragment>
      ))}
      <Polyline points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={c.accent} strokeWidth={2.5} strokeLinejoin="round" />
      <Circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r={4} fill={c.accent} />
    </Svg>
  );
}

/** Écran « Ma progression » : niveau, cote, courbe, défis de la semaine, trophées. */
export default function Progression({ progression: p, surRetour }) {
  const c = useCouleurs();
  const t = useT();
  const { width } = useWindowDimensions();
  const obtenus = TROPHEES.filter((x) => p.trophees[x.cle]).length;
  return (
    <View style={{ gap: 12 }}>
      <Bouton titre={t('retour')} onPress={surRetour} />
      <Texte style={{ fontSize: 22, fontWeight: '800' }}>{t('progTitre')}</Texte>
      <Carte>
        <ResumeProgression progression={p} />
        {p.parties ? <Texte attenue style={{ fontSize: 13 }}>{t('progBilan', { p: p.parties, v: p.victoires, s: p.meilleureSerie })}</Texte> : null}
      </Carte>
      <Carte titre={t('progCourbe')}>
        {p.historique.length ? <Courbe historique={p.historique} largeur={Math.min(width - 64, 520)} /> : <Texte attenue>{t('progAucune')}</Texte>}
      </Carte>
      <Carte titre={t('progDefis')}>
        {etatDefis(p).map((d) => (
          <View key={d.cle} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Texte style={{ flex: 1 }}>{t(d.cle)}</Texte>
              <Texte attenue style={{ fontSize: 12 }}>{d.fait ? t('progDefiFini') : `${d.valeur} / ${d.but}`}</Texte>
            </View>
            <Barre part={d.valeur / d.but} couleur={d.fait ? '#2ecc71' : undefined} />
          </View>
        ))}
      </Carte>
      <Carte titre={t('progTrophees', { n: obtenus, t: TROPHEES.length })}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TROPHEES.map((x) => {
            const ok = !!p.trophees[x.cle];
            return (
              <View key={x.cle} style={{ width: 96, alignItems: 'center', gap: 4, padding: 8, borderRadius: 12, borderWidth: 1,
                borderColor: `${c.accent}59`, opacity: ok ? 1 : 0.45 }}>
                <Texte style={{ fontSize: 26 }}>{ok ? x.icone : '🔒'}</Texte>
                <Texte style={{ fontSize: 12, textAlign: 'center' }}>{t(x.cle)}</Texte>
              </View>
            );
          })}
        </View>
      </Carte>
      <Texte attenue style={{ fontSize: 12 }}>{t('progClassementInfo')}</Texte>
    </View>
  );
}

/** Bandeau de fin de partie : XP gagnés, nouvelle cote, niveau, trophées, défis. */
export function GainPartie({ gain }) {
  const c = useCouleurs();
  const t = useT();
  if (!gain) return null;
  const d = gain.variation > 0 ? `+${gain.variation}` : String(gain.variation);
  const lignes = [];
  if (gain.niveauApres > gain.niveauAvant) lignes.push(t('gainNiveau', { n: gain.niveauApres }));
  gain.defis.forEach((x) => lignes.push(t('gainDefi', { nom: t(x) })));
  gain.trophees.forEach((x) => lignes.push(t('gainTrophee', { nom: t(x) })));
  return (
    <View style={{ borderWidth: 2, borderColor: c.accent, borderRadius: 12, padding: 12, gap: 4, backgroundColor: `${c.accent}1f` }}>
      <Texte style={{ textAlign: 'center', fontWeight: '800', fontSize: 17 }}>{t('gainPartie', { xp: gain.xp, c: gain.cote, d })}</Texte>
      {lignes.map((l) => <Texte key={l} style={{ textAlign: 'center', fontWeight: '700' }}>{l}</Texte>)}
    </View>
  );
}
