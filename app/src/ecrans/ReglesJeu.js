import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Carte, Texte, useCouleurs, useT } from '../ui';
import { TEXTES_REGLES } from '../../../moteur/textes-regles.js';
import { Plateau } from '../Plateau';
import { nouvellePartie, geometrie } from '../../../moteur/partie.js';
import { REGLES_PAR_DEFAUT, COULEURS, valeurDesLongs, faitRejouer } from '../../../moteur/regles.js';
import { cle } from '../../../moteur/plateau.js';

/** Page « Règles du jeu », avec des dessins faits à partir du moteur. */

const quatre = () => nouvellePartie(REGLES_PAR_DEFAUT, COULEURS.map((c) => ({ nom: c.nom })));
const g = geometrie(REGLES_PAR_DEFAUT, 4);

const etatPlateau = (() => { const e = quatre(); e.joueurs.forEach((j) => { j.pions[0] = 0; }); return e; })();
const etatTrajet = (() => { const e = quatre(); e.joueurs[0].pions[0] = 0; return e; })();
const etatGroupe = (() => {
  const e = quatre();
  const iVert = g.chemins[1].findIndex((q) => cle(q) === cle(g.chemins[0][25]));
  e.joueurs[0].pions[0] = 25;
  e.joueurs[0].pions[1] = 25;
  e.joueurs[1].pions[0] = iVert - 4;
  return e;
})();

const COULEUR = { entree: '#f6c28b', rejoue: '#b9dfc4', kaapal: '#cfc6ba' };

function DeLong({ points, petit }) {
  return (
    <View accessibilityLabel={`face ${points}`} style={{ width: petit ? 58 : 84, height: petit ? 20 : 28, borderRadius: 6, backgroundColor: '#d9a845',
      borderWidth: 2, borderColor: '#7a5418', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: petit ? 7 : 11 }}>
      {Array.from({ length: points }, (_, k) => (
        <View key={k} style={{ width: petit ? 7 : 9, height: petit ? 7 : 9, borderRadius: 5, backgroundColor: '#3b2410' }} />
      ))}
    </View>
  );
}

function Gras({ children }) {
  return <Texte style={{ fontWeight: '800' }}>{children}</Texte>;
}

/** Texte des règles avec <strong>…</strong> rendu en gras. */
function Riche({ html, style }) {
  const morceaux = html.split(/(<strong>.*?<\/strong>)/g).filter(Boolean);
  return (
    <Texte style={style}>
      {morceaux.map((m, i) => (m.startsWith('<strong>') ? <Gras key={i}>{m.slice(8, -9)}</Gras> : m))}
    </Texte>
  );
}

export default function ReglesJeu() {
  const c = useCouleurs();
  const t = useT();
  const TX = TEXTES_REGLES[t.langue] || TEXTES_REGLES.fr;
  // Dans l'appli, le dessin du trajet n'est pas numéroté : on retire « (0) », « (1 à 3) »…
  const R = (cle) => (TX[cle] || TEXTES_REGLES.fr[cle]).replace(/\s*\(\d+(\s+\S+\s+\d+)?\)/g, '');
  const { width } = useWindowDimensions();
  const largeur = Math.min(width - 60, 520);
  const F = REGLES_PAR_DEFAUT.des.faces;
  const dessin = (etat, trajet) => (
    <View style={{ alignItems: 'center' }}>
      <Plateau etat={etat} coups={[]} largeur={largeur} surPion={() => {}} trajetDe={trajet ? 0 : null} />
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <Texte attenue style={{ fontSize: 22 }}>தாயம்</Texte>
        <Texte style={{ fontSize: 28, fontWeight: '800', color: c.accent }}>{R('titre')}</Texte>
        <Texte attenue>{R('sousTitre')}</Texte>
      </View>

      <Carte titre={R('h1')}>
        <Riche html={R('but')} />
      </Carte>

      <Carte titre={R('h2')}>
        {dessin(etatPlateau, false)}
        {['pl1', 'pl2', 'pl3', 'pl4'].map((k) => <Riche key={k} html={`• ${R(k)}`} style={{ lineHeight: 22 }} />)}
      </Carte>

      <Carte titre={R('h3')}>
        <Riche html={R('des1')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {F.map((f) => (
            <View key={f} style={{ alignItems: 'center', gap: 4 }}>
              <DeLong points={f} />
              <Texte attenue style={{ fontSize: 12 }}>{f === 0 ? R('vide') : f === 1 ? R('point') : R('points').replace('{n}', f)}</Texte>
            </View>
          ))}
        </View>
        <Riche html={R('des2')} />
        <View style={{ alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Texte attenue style={{ width: 68, fontSize: 10, textAlign: 'center' }}>{R('entete')}</Texte>
            {F.map((b) => <View key={b} style={{ width: 54, alignItems: 'center', paddingVertical: 4 }}><View style={{ transform: [{ scale: 0.8 }] }}><DeLong points={b} petit /></View></View>)}
          </View>
          {F.map((a) => (
            <View key={a} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 68, alignItems: 'center', paddingVertical: 4 }}><DeLong points={a} petit /></View>
              {F.map((b) => {
                const tirage = { valeur: valeurDesLongs(REGLES_PAR_DEFAUT.des, [a, b]), detail: [a, b] };
                const kaapal = tirage.valeur === 0;
                const fond = kaapal ? COULEUR.kaapal
                  : REGLES_PAR_DEFAUT.valeursEntree.includes(tirage.valeur) ? COULEUR.entree
                  : faitRejouer(REGLES_PAR_DEFAUT, tirage) ? COULEUR.rejoue : 'transparent';
                return (
                  <View key={b} style={{ width: 54, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: fond,
                    borderWidth: 1, borderColor: c.trait }}>
                    <Texte style={{ fontWeight: '800', fontSize: kaapal ? 11 : 16, color: fond === 'transparent' ? c.texte : '#2b1d10' }}>
                      {kaapal ? 'Kaapal' : tirage.valeur}
                    </Texte>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <Texte><Texte style={{ color: '#c47a2c', fontWeight: '800' }}>■</Texte> <Riche html={R('legEntree')} /></Texte>
        <Texte><Texte style={{ color: '#4f9a66', fontWeight: '800' }}>■</Texte> <Riche html={R('legRejoue')} /></Texte>
        <Texte><Texte style={{ color: '#9b9083', fontWeight: '800' }}>■</Texte> <Riche html={R('legKaapal')} /></Texte>
      </Carte>

      <Carte titre={R('h4')}>
        {['t1', 't2', 't3', 't4', 't5'].map((k, n) => <Riche key={k} html={`${n + 1}. ${R(k)}`} />)}
      </Carte>

      <Carte titre={R('h5')}>
        {dessin(etatTrajet, true)}
        {['tr1', 'tr2', 'tr3', 'tr4', 'tr5'].map((k, n) => <Riche key={k} html={`${n + 1}. ${R(k)}`} />)}
      </Carte>

      <Carte titre={R('h6')}>
        {dessin(etatGroupe, false)}
        {['m1', 'm2', 'm3', 'm4'].map((k) => <Riche key={k} html={`• ${R(k)}`} style={{ lineHeight: 22 }} />)}
      </Carte>

      <Carte titre={R('h7')}>
        <Riche html={R('cap')} />
      </Carte>

      <Carte titre={R('h8')}>
        {['j1', 'j2', 'j3'].map((k) => <Riche key={k} html={`• ${R(k)}`} style={{ lineHeight: 22 }} />)}
        <Texte attenue style={{ fontSize: 13 }}>{R('note')}</Texte>
      </Carte>
    </View>
  );
}
