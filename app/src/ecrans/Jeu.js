import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Bouton, Carte, Texte, useCouleurs } from '../ui';
import { Plateau, Cauri } from '../Plateau';
import { lancer, jouer, coupsPossibles, geometrie } from '../../../moteur/partie.js';
import { resumeRegles } from '../../../moteur/regles.js';

/**
 * Écran de jeu (local ou en ligne).
 * moi : index du joueur sur cet appareil (null en local : tout le monde joue ici).
 * surAction(nouvelEtat) : applique / envoie le nouvel état.
 */
export default function Jeu({ etat, moi, occupe, message, surAction, surQuitter, surRejouer }) {
  const c = useCouleurs();
  const { width } = useWindowDimensions();
  const [voirRegles, setVoirRegles] = useState(false);
  const [voirTrajet, setVoirTrajet] = useState(false);
  const largeur = Math.min(width - 32, 560);
  const g = geometrie(etat.regles, etat.joueurs.length);
  const actif = etat.joueurs[etat.tour];
  const peut = etat.phase !== 'fini' && !occupe && (moi === null ? !actif.ordi : etat.tour === moi);
  const coups = peut ? coupsPossibles(etat) : [];
  const entree = coups.find((x) => x.depuis === -1);

  let consigne;
  if (etat.phase === 'fini') consigne = `🏆 ${etat.joueurs[etat.gagnant].nom} a gagné !`;
  else if (moi !== null && etat.tour !== moi) consigne = `C'est au tour de ${actif.nom}…`;
  else if (actif.ordi) consigne = `${actif.nom} réfléchit…`;
  else if (occupe) consigne = 'Le pion avance…';
  else if (etat.phase === 'lancer') consigne = moi === null ? `${actif.nom}, à toi : lance les dés.` : 'À toi : lance les dés.';
  else consigne = 'Touche un pion entouré de blanc pour le déplacer.';

  const l = etat.lancer || etat.dernierLancer;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {etat.joueurs.map((j, i) => {
          const arrives = j.pions.filter((p) => p === g.arrivee).length;
          const maison = j.pions.filter((p) => p === -1).length;
          const estActif = i === etat.tour && etat.phase !== 'fini';
          return (
            <View key={i} style={{
              flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8,
              borderRadius: 10, backgroundColor: c.surface, borderWidth: 2, borderColor: estActif ? c.accent : 'transparent',
            }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: j.couleur }} />
              <View style={{ flex: 1 }}>
                <Texte numberOfLines={1} style={{ fontWeight: '700' }}>{j.nom}{i === moi ? ' (toi)' : ''}</Texte>
                <Texte attenue style={{ fontSize: 12 }}>🏠 {maison} · 🎯 {arrives}/{j.pions.length} · ⚔️ {j.captures}</Texte>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ alignItems: 'center' }}>
        <Plateau etat={etat} coups={coups} largeur={largeur} surPion={(p) => peut && surAction(jouer(etat, p))}
          trajetDe={voirTrajet ? (moi !== null ? moi : actif.ordi ? Math.max(0, etat.joueurs.findIndex((j) => !j.ordi)) : etat.tour) : null} />
      </View>

      <Carte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', minHeight: 44 }}>
          {!l ? <Texte attenue>Lance les dés</Texte> : (
            <>
              {!etat.lancer ? <Texte attenue style={{ width: '100%', textAlign: 'center', fontSize: 12 }}>Dernier lancer ({etat.joueurs[l.joueur].nom}) :</Texte> : null}
              {etat.regles.des.type === 'cauris'
                ? l.detail.map((o, i) => <Cauri key={i} ouvert={o} />)
                : l.detail.map((f, i) => (
                  <View key={i} accessibilityLabel={`dé long : ${f}`} style={{ width: 92, height: 30, borderRadius: 6, backgroundColor: '#d9a845', borderWidth: 2, borderColor: '#7a5418', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 }}>
                    {f > 3 ? <Texte style={{ color: '#3b2410', fontWeight: '800' }}>{f}</Texte>
                      : Array.from({ length: f }, (_, k) => <View key={k} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#3b2410' }} />)}
                  </View>
                ))}
              <Texte style={{ fontSize: 30, fontWeight: '800', color: c.accent, marginLeft: 6 }}>{l.valeur}</Texte>
            </>
          )}
        </View>
        <Texte style={{ textAlign: 'center', fontWeight: '700', color: etat.phase === 'fini' ? c.texte : actif.couleur }}>{consigne}</Texte>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {etat.phase !== 'fini' ? (
            <Bouton style={{ flex: 1 }} principal titre="Lancer" desactive={!(peut && etat.phase === 'lancer')}
              onPress={() => surAction(lancer(etat))} />
          ) : null}
          {entree ? <Bouton style={{ flex: 1 }} titre="Faire entrer un pion" onPress={() => surAction(jouer(etat, entree.pion))} /> : null}
          {etat.phase === 'fini' && moi === null ? <Bouton style={{ flex: 1 }} principal titre="Rejouer" onPress={surRejouer} /> : null}
        </View>
      </Carte>

      {message ? <Texte erreur>{message}</Texte> : null}

      <Carte titre="Journal">
        {[...etat.journal].reverse().slice(0, 12).map((ligne, i) => (
          <Texte key={i} style={{ fontSize: 14 }}>{ligne}</Texte>
        ))}
      </Carte>

      <Bouton titre={voirTrajet ? 'Cacher le trajet' : 'Voir le trajet'} onPress={() => setVoirTrajet(!voirTrajet)} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Bouton style={{ flex: 1 }} titre="Quitter" onPress={surQuitter} />
        <Bouton style={{ flex: 1 }} titre={voirRegles ? 'Masquer les règles' : 'Voir les règles'} onPress={() => setVoirRegles(!voirRegles)} />
      </View>
      {voirRegles ? resumeRegles(etat.regles).map((x, i) => <Texte key={i} attenue>• {x}</Texte>) : null}
    </View>
  );
}
