import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Bouton, Carte, Texte, useCouleurs, useT } from '../ui';
import { Plateau } from '../Plateau';
import { revoirPartie, geometrie } from '../../../moteur/partie.js';
import { nomLancer } from '../../../moteur/regles.js';
import { traduireJournal, traduireNom } from '../../../moteur/i18n.js';

/** Lignes du journal ajoutées entre deux états (le journal garde seulement les 30 dernières). */
function lignesAjoutees(avant, apres) {
  const a = avant.journal;
  const b = apres.journal;
  for (let n = 1; n <= 4; n++) {
    const debutB = b.slice(0, b.length - n);
    const finA = a.slice(a.length - debutB.length);
    if (debutB.length === finA.length && debutB.every((l, i) => l === finA[i])) return b.slice(b.length - n);
  }
  return b.slice(-1);
}

/** Revoir une partie terminée, coup par coup, avec lecture automatique. */
export default function Revoir({ etatFinal, surRetour }) {
  const c = useCouleurs();
  const t = useT();
  const N = (nom) => traduireNom(nom, t);
  const { width } = useWindowDimensions();
  const etats = useMemo(() => revoirPartie(etatFinal), [etatFinal]);
  const [i, setI] = useState(0);
  const [lecture, setLecture] = useState(false);
  const minuteur = useRef(null);

  useEffect(() => {
    if (!lecture || !etats) return undefined;
    minuteur.current = setInterval(() => {
      setI((x) => {
        if (x + 1 >= etats.length - 1) setLecture(false);
        return Math.min(x + 1, etats.length - 1);
      });
    }, 900);
    return () => clearInterval(minuteur.current);
  }, [lecture, etats]);

  if (!etats) {
    return (
      <View style={{ gap: 12 }}>
        <Bouton titre={t('retour')} onPress={surRetour} />
        <Texte erreur>{t('pasDeReplay')}</Texte>
      </View>
    );
  }
  const e = etats[i];
  const g = geometrie(e.regles, e.joueurs.length);
  const dernier = etats.length - 1;
  const l = e.dernierLancer;
  const ligne = i === 0 ? t('debutPartieReplay') : lignesAjoutees(etats[i - 1], e).map((x) => traduireJournal(x, t)).join(' ');
  const aller = (n) => { setLecture(false); setI(Math.max(0, Math.min(dernier, n))); };

  return (
    <View style={{ gap: 12 }}>
      <Bouton titre={t('retour')} onPress={surRetour} />
      <Texte style={{ fontSize: 22, fontWeight: '800' }}>{t('revoir')}</Texte>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {e.joueurs.map((j, k) => (
          <View key={k} style={{ flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10,
            backgroundColor: c.surface, borderWidth: 2, borderColor: k === e.tour && e.phase !== 'fini' ? c.accent : 'transparent' }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: j.couleur }} />
            <View style={{ flex: 1 }}>
              <Texte numberOfLines={1} style={{ fontWeight: '700' }}>{N(j.nom)}</Texte>
              <Texte attenue style={{ fontSize: 12 }}>
                🏠 {j.pions.filter((p) => p === -1).length} · 🎯 {j.pions.filter((p) => p === g.arrivee).length}/{j.pions.length} · ⚔️ {j.captures}
              </Texte>
            </View>
          </View>
        ))}
      </View>
      <Plateau etat={e} coups={[]} largeur={Math.min(width - 32, 560)} surPion={() => {}} />
      <Carte>
        {l ? <Texte style={{ textAlign: 'center', fontSize: 24, fontWeight: '800', color: c.accent }}>{nomLancer(e.regles, l)}</Texte> : null}
        <Texte style={{ textAlign: 'center', fontWeight: '700', color: i === 0 ? c.texte : e.joueurs[(l || { joueur: 0 }).joueur].couleur }}>{ligne}</Texte>
        <Texte attenue style={{ textAlign: 'center' }}>{t('etapeN', { n: i, total: dernier })}</Texte>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Bouton style={{ flex: 1, paddingHorizontal: 4 }} titre={t('rDebut')} desactive={i === 0} onPress={() => aller(0)} />
          <Bouton style={{ flex: 1, paddingHorizontal: 4 }} titre={t('rPrec')} desactive={i === 0} onPress={() => aller(i - 1)} />
          <Bouton style={{ flex: 1, paddingHorizontal: 4 }} titre={t('rSuiv')} desactive={i === dernier} onPress={() => aller(i + 1)} />
          <Bouton style={{ flex: 1, paddingHorizontal: 4 }} titre={t('rFin')} desactive={i === dernier} onPress={() => aller(dernier)} />
        </View>
        <Bouton principal titre={lecture ? t('rPause') : t('rLecture')}
          onPress={() => { if (!lecture && i >= dernier) setI(0); setLecture(!lecture); }} />
      </Carte>
    </View>
  );
}
