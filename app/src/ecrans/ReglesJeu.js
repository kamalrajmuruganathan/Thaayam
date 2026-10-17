import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Carte, Texte, useCouleurs } from '../ui';
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

function Puce({ children }) {
  return <Texte style={{ lineHeight: 22 }}>• {children}</Texte>;
}

function Gras({ children }) {
  return <Texte style={{ fontWeight: '800' }}>{children}</Texte>;
}

export default function ReglesJeu() {
  const c = useCouleurs();
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
        <Texte style={{ fontSize: 28, fontWeight: '800', color: c.accent }}>Règles du Thaayam</Texte>
        <Texte attenue>Le jeu de plateau traditionnel tamoul, de 2 à 4 joueurs</Texte>
      </View>

      <Carte titre="1. Le but">
        <Texte>Chaque joueur a <Gras>4 pions</Gras>. Il faut leur faire faire le tour de la croix, puis les amener au <Gras>centre</Gras>. Le premier qui amène ses 4 pions au centre <Gras>gagne</Gras>.</Texte>
      </Carte>

      <Carte titre="2. Le plateau">
        {dessin(etatPlateau, false)}
        <Puce>Une <Gras>croix</Gras> de 4 bras ; chaque bras a 3 colonnes de 4 cases.</Puce>
        <Puce>Chaque joueur a son bras et sa couleur. Au début, ses pions attendent <Gras>au centre</Gras>, du côté de son bras. La colonne du milieu de son bras est à sa couleur.</Puce>
        <Puce>Entre deux bras, il n'y a pas de case : on passe en <Gras>diagonale</Gras>, là où sont dessinés les 3 arcs.</Puce>
        <Puce>Au milieu, le grand carré barré est le <Gras>centre</Gras> : l'arrivée.</Puce>
      </Carte>

      <Carte titre="3. Les dés">
        <Texte>On lance <Gras>2 dés longs</Gras> (dayakattai). Chaque dé a 4 faces :</Texte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {F.map((f) => (
            <View key={f} style={{ alignItems: 'center', gap: 4 }}>
              <DeLong points={f} />
              <Texte attenue style={{ fontSize: 12 }}>{f === 0 ? 'vide' : `${f} point${f > 1 ? 's' : ''}`}</Texte>
            </View>
          ))}
        </View>
        <Texte>On <Gras>additionne</Gras> les points des deux dés. Les 16 lancers possibles :</Texte>
        <View style={{ alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Texte attenue style={{ width: 68, fontSize: 10, textAlign: 'center' }}>dé 1 ↓ dé 2 →</Texte>
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
        <Texte><Texte style={{ color: '#c47a2c', fontWeight: '800' }}>■</Texte> <Gras>1 (thaayam)</Gras> : fait entrer un pion, et on rejoue.</Texte>
        <Texte><Texte style={{ color: '#4f9a66', fontWeight: '800' }}>■</Texte> <Gras>5, 6 et 2 + 2</Gras> : on rejoue. Attention : 1 + 3 fait aussi 4, mais ne fait pas rejouer.</Texte>
        <Texte><Texte style={{ color: '#9b9083', fontWeight: '800' }}>■</Texte> <Gras>Kaapal</Gras> (deux faces vides) : on ne bouge pas, on passe les dés au joueur suivant.</Texte>
      </Carte>

      <Carte titre="4. Un tour de jeu">
        <Texte>1. On lance les dés.</Texte>
        <Texte>2. On choisit <Gras>un seul pion</Gras> et on l'avance du total. On ne partage pas un lancer entre deux pions.</Texte>
        <Texte>3. Si on peut bouger un pion, on est obligé de le faire.</Texte>
        <Texte>4. Si on ne peut rien bouger, le tour passe (sauf si le lancer fait rejouer).</Texte>
        <Texte>5. On rejoue avec 1, 5, 6, 2 + 2, et après avoir mangé un pion.</Texte>
      </Carte>

      <Carte titre="5. Le trajet d'un pion">
        {dessin(etatTrajet, true)}
        <Texte>1. Avec un 1, le pion sort du centre sur la <Gras>première case de sa colonne</Gras>, collée au centre.</Texte>
        <Texte>2. Il <Gras>descend sa colonne</Gras> jusqu'au bout de son bras.</Texte>
        <Texte>3. Il fait <Gras>tout le tour de la croix</Gras> dans le sens inverse des aiguilles d'une montre, par les colonnes extérieures des bras (d'un bras à l'autre, il passe directement en diagonale, là où sont les arcs).</Texte>
        <Texte>4. Il revient au bout de son bras et <Gras>remonte sa colonne</Gras> : personne d'autre n'y passe.</Texte>
        <Texte>5. Il rentre au <Gras>centre</Gras>. Il faut tomber <Gras>pile</Gras> dessus.</Texte>
      </Carte>

      <Carte titre="6. Manger">
        {dessin(etatGroupe, false)}
        <Puce>Si ton pion s'arrête sur une case où il y a des pions adverses, tu les <Gras>manges</Gras> : ils retournent à la maison. Et tu <Gras>rejoues</Gras>.</Puce>
        <Puce>Tu peux <Gras>empiler</Gras> tes propres pions sur une même case. Mais si un adversaire tombe dessus, il mange <Gras>tout le groupe</Gras> d'un coup (sur le dessin, si Vert fait 4, il mange les 2 pions rouges).</Puce>
        <Puce><Gras>Revanche</Gras> : des pions mangés ensemble peuvent <Gras>rentrer ensemble</Gras>. Avec 1, 5, 6 ou 2 + 2, tu peux faire entrer tout le groupe d'un coup. C'est toi qui choisis.</Puce>
        <Puce>Un pion arrivé au centre ne peut plus être mangé.</Puce>
      </Carte>

      <Carte titre="7. Capture obligatoire">
        <Texte>Tant que tu n'as mangé <Gras>aucun</Gras> pion adverse, tes pions ne peuvent pas monter vers le centre : revenus au bout de leur bras, ils <Gras>refont un tour</Gras>. Dès que tu as mangé un pion, tous tes pions peuvent monter.</Texte>
      </Carte>

      <Carte titre="8. Jouer">
        <Puce><Gras>En ligne entre amis</Gras> : un joueur crée la partie et envoie le code de 5 lettres aux autres.</Puce>
        <Puce><Gras>Contre l'ordinateur</Gras> : facile, normal ou fort.</Puce>
        <Puce><Gras>À plusieurs sur un même téléphone</Gras>, chacun son tour.</Puce>
        <Texte attenue style={{ fontSize: 13 }}>Les règles changent d'une famille à l'autre : avant chaque partie, tout est réglable (nombre de pions, valeurs qui font rejouer, Kaapal, empilement…).</Texte>
      </Carte>
    </View>
  );
}
