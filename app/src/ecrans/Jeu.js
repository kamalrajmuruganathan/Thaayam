import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Bouton, Carte, Texte, useCouleurs, useTheme, useT, couleursDes, themeLumineux } from '../ui';
import { lancerGuide, conseilGuide } from '../../../moteur/guide.js';
import { sonActif, vibrationsActives, basculerSon, basculerVibrations } from '../sons';
import { Plateau, Cauri } from '../Plateau';
import { lancer, jouer, coupsPossibles, geometrie } from '../../../moteur/partie.js';
import { nomLancer } from '../../../moteur/regles.js';
import { REACTIONS } from '../../../moteur/en-ligne.js';
import { traduireJournal, traduireNom, traduireReaction, resumeReglesTraduit } from '../../../moteur/i18n.js';

/**
 * Écran de jeu (local ou en ligne).
 * moi : index du joueur sur cet appareil (null en local : tout le monde joue ici).
 * surAction(nouvelEtat) : applique / envoie le nouvel état.
 */
export default function Jeu({ etat, moi, occupe, message, surAction, surQuitter, surRejouer, surReglesJeu,
  bulle, surReaction, surRevanche, revancheExiste, guide = false, desRoulent = null, enMouvement = null, eclat = null, surRevoir = null }) {
  const c = useCouleurs();
  const theme = useTheme();
  const lumineux = themeLumineux(theme);
  const D = couleursDes(theme);
  const [, rafraichir] = useState(0);
  const t = useT();
  const N = (nom) => traduireNom(nom, t);
  const { width } = useWindowDimensions();
  const [voirRegles, setVoirRegles] = useState(false);
  const [voirTrajet, setVoirTrajet] = useState(false);
  const largeur = Math.min(width - 32, 560);
  const g = geometrie(etat.regles, etat.joueurs.length);
  const actif = etat.joueurs[etat.tour];
  const peut = etat.phase !== 'fini' && !occupe && (moi === null ? !actif.ordi : etat.tour === moi);
  const coups = peut ? coupsPossibles(etat) : [];
  const entree = coups.find((x) => x.depuis === -1 && !x.groupe);
  const groupe = coups.find((x) => x.groupe);

  let consigne;
  if (etat.phase === 'fini') consigne = t('gagne', { nom: N(etat.joueurs[etat.gagnant].nom) });
  else if (moi !== null && etat.tour !== moi) consigne = t('tourDe', { nom: N(actif.nom) });
  else if (actif.ordi) consigne = t('reflechit', { nom: N(actif.nom) });
  else if (occupe) consigne = t('pionAvance');
  else if (etat.phase === 'lancer') consigne = moi === null ? t('aToiLocal', { nom: N(actif.nom) }) : t('aToi');
  else consigne = t('touchePionBlanc');

  // Pendant que les dés roulent, on montre des faces au hasard
  const l = desRoulent || etat.lancer || etat.dernierLancer;
  const conseil = guide ? conseilGuide(etat) : null;

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
                <Texte numberOfLines={1} style={{ fontWeight: '700' }}>{N(j.nom)}{i === moi ? t('toi') : ''}</Texte>
                <Texte attenue style={{ fontSize: 12 }}>🏠 {maison} · 🎯 {arrives}/{j.pions.length} · ⚔️ {j.captures}</Texte>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ alignItems: 'center' }}>
        <Plateau etat={etat} coups={coups} largeur={largeur} surPion={(p) => peut && surAction(jouer(etat, p))}
          enMouvement={enMouvement} eclat={eclat} vue={moi}
          trajetDe={voirTrajet ? (moi !== null ? moi : actif.ordi ? Math.max(0, etat.joueurs.findIndex((j) => !j.ordi)) : etat.tour) : null} />
      </View>

      {conseil ? (
        <View style={{ borderWidth: 2, borderColor: c.accent, borderRadius: 14, padding: 12, gap: 4, backgroundColor: c.surface }}>
          <Texte style={{ fontWeight: '800', color: c.accent }}>{t('guideTitre')}</Texte>
          <Texte style={{ fontWeight: '600', lineHeight: 21 }}>{t(conseil.cle, conseil.params)}</Texte>
        </View>
      ) : null}

      <Carte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', minHeight: 44 }}>
          {!l ? <Texte attenue>{t('lanceLesDes')}</Texte> : (
            <>
              {!etat.lancer ? <Texte attenue style={{ width: '100%', textAlign: 'center', fontSize: 12 }}>{t('dernierLancer', { nom: N(etat.joueurs[l.joueur].nom) })}</Texte> : null}
              {etat.regles.des.type === 'cauris'
                ? l.detail.map((o, i) => <Cauri key={i} ouvert={o} />)
                : etat.regles.des.type === 'de6'
                ? l.detail.map((f, i) => <DeCube key={i} valeur={f} D={D} lumineux={lumineux} roule={!!desRoulent} />)
                : l.detail.map((f, i) => (
                  <View key={i} accessibilityLabel={`dé long : ${f}`} style={{ width: 92, height: 30, borderRadius: 6, backgroundColor: D.fond, borderWidth: D.epais, borderColor: D.bord,
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12,
                    transform: desRoulent ? [{ rotate: `${(i % 2 ? 1 : -1) * 8}deg` }, { translateY: -4 }] : [],
                    shadowColor: D.point, shadowOpacity: lumineux ? 0.5 : 0, shadowRadius: 8 }}>
                    {f > 3 ? <Texte style={{ color: D.point, fontWeight: '800' }}>{f}</Texte>
                      : Array.from({ length: f }, (_, k) => <View key={k} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: D.point }} />)}
                  </View>
                ))}
              {desRoulent ? null : (
                <Texte style={{ fontSize: lumineux ? 36 : 30, fontWeight: lumineux ? '500' : '800', fontStyle: lumineux ? 'italic' : 'normal', color: lumineux ? D.valeur : c.accent, marginLeft: 6,
                  textShadowColor: lumineux ? D.bord : 'transparent', textShadowRadius: lumineux ? 12 : 0 }}>{nomLancer(etat.regles, l)}</Texte>
              )}
            </>
          )}
        </View>
        <Texte style={{ textAlign: 'center', fontWeight: '700', color: etat.phase === 'fini' ? c.texte : actif.couleur }}>{consigne}</Texte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {etat.phase !== 'fini' ? (
            <Bouton style={{ flex: 1 }} principal titre={t('lancer')} desactive={!(peut && etat.phase === 'lancer')}
              onPress={() => surAction(lancer(etat, Math.random, guide ? lancerGuide(etat) : null))} />
          ) : null}
          {entree ? <Bouton style={{ flex: 1 }} titre={t('entrerPion')} onPress={() => surAction(jouer(etat, entree.pion))} /> : null}
          {groupe ? <Bouton style={{ flex: 1 }} titre={t('entrerGroupe', { n: groupe.groupe.length })} onPress={() => surAction(jouer(etat, groupe.pion, true))} /> : null}
          {etat.phase === 'fini' && moi === null ? <Bouton style={{ flex: 1 }} principal titre={t('rejouer')} onPress={surRejouer} /> : null}
          {etat.phase === 'fini' && surRevoir && Array.isArray(etat.histo) ? (
            <Bouton style={{ flex: 1 }} titre={t('revoir')} onPress={surRevoir} />
          ) : null}
          {etat.phase === 'fini' && surRevanche ? (
            <Bouton style={{ flex: 1 }} principal desactive={occupe} titre={revancheExiste ? t('rejoindreRevanche') : t('revanche')} onPress={surRevanche} />
          ) : null}
        </View>
      </Carte>

      {bulle ? (
        <View style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 3,
          borderColor: (etat.joueurs[bulle.place] || {}).couleur || c.accent, backgroundColor: c.surface }}>
          <Texte style={{ fontWeight: '800', fontSize: 16 }}>{bulle.texte}</Texte>
        </View>
      ) : null}
      {surReaction ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {REACTIONS.map((r) => (
            <Pressable key={r} onPress={() => surReaction(r)} accessibilityRole="button"
              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: c.trait, backgroundColor: c.surface }}>
              <Texte style={{ fontSize: 15 }}>{traduireReaction(r, t)}</Texte>
            </Pressable>
          ))}
        </View>
      ) : null}
      {message ? <Texte erreur>{message}</Texte> : null}

      <Carte titre={t('journal')}>
        {[...etat.journal].reverse().slice(0, 12).map((ligne, i) => (
          <Texte key={i} style={{ fontSize: 14 }}>{traduireJournal(ligne, t)}</Texte>
        ))}
      </Carte>

      <Bouton titre={voirTrajet ? t('cacherTrajet') : t('voirTrajet')} onPress={() => setVoirTrajet(!voirTrajet)} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Bouton style={{ flex: 1 }} titre={sonActif() ? t('son') : t('muet')} onPress={() => { basculerSon(); rafraichir((x) => x + 1); }} />
        <Bouton style={{ flex: 1 }} titre={vibrationsActives() ? t('vibrOui') : t('vibrNon')} onPress={() => { basculerVibrations(); rafraichir((x) => x + 1); }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Bouton style={{ flex: 1 }} titre={t('quitter')} onPress={surQuitter} />
        <Bouton style={{ flex: 1 }} titre={voirRegles ? t('masquerRegles') : t('voirReglesCourt')} onPress={() => setVoirRegles(!voirRegles)} />
      </View>
      {voirRegles ? resumeReglesTraduit(etat.regles, t).map((x, i) => <Texte key={i} attenue>• {x}</Texte>) : null}
      {surReglesJeu ? <Bouton titre={t('reglesDessins2')} onPress={surReglesJeu} /> : null}
    </View>
  );
}

/** Dé classique vu de dessus : 1 à 6 points placés comme sur un vrai dé. */
const POINTS_DE6 = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function DeCube({ valeur, D, lumineux, roule }) {
  const fond = lumineux || D.fond !== '#d9a845' ? D.fond : '#fbf7ef';
  return (
    <View accessibilityLabel={`dé : ${valeur}`} style={{ width: 46, height: 46, borderRadius: 9, backgroundColor: fond, borderWidth: D.epais, borderColor: D.bord,
      flexDirection: 'row', flexWrap: 'wrap', padding: 5, shadowColor: D.point, shadowOpacity: lumineux ? 0.5 : 0, shadowRadius: 8,
      transform: roule ? [{ rotate: '-10deg' }, { translateY: -4 }] : [] }}>
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={{ width: '33.3%', height: '33.3%', alignItems: 'center', justifyContent: 'center' }}>
          {(POINTS_DE6[valeur] || []).includes(i) ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: D.point }} /> : null}
        </View>
      ))}
    </View>
  );
}
