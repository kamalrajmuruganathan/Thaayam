import React, { useState } from 'react';
import { View } from 'react-native';
import { Bouton, Carte, Champ, Choix, Interrupteur, Texte, useT } from '../ui';
import { traduireErreur, traduireNom } from '../../../moteur/i18n.js';
import {
  COULEURS, PRESETS_DES, TAILLES, lireListe, normaliserRegles, valeursPossibles, avecReglesFixes,
} from '../../../moteur/regles.js';

/** Formulaire de toutes les règles. mode : 'local' ou 'ligne'. */
export default function Reglages({ mode, reglesInitiales, ordiInitial, pseudo, surValider, occupe, erreurServeur }) {
  const t = useT();
  const N = (nom) => traduireNom(nom, t);
  const [r, setR] = useState(reglesInitiales);
  const [nb, setNb] = useState(2);
  const [ordi, setOrdi] = useState(ordiInitial || [false, false, false, false]);
  const [niveau, setNiveau] = useState('normal');
  const [noms, setNoms] = useState(COULEURS.map((c, i) =>
    N(ordi[i] ? `Ordi ${c.nom.toLowerCase()}` : i === 0 && pseudo ? pseudo : c.nom)));
  // Les noms par défaut sont gardés en français (« Rouge », « Ordi vert ») pour être traduits à l'affichage
  const nomCanonique = (x, i) => {
    const brut = x.trim();
    const defauts = [COULEURS[i].nom, `Ordi ${COULEURS[i].nom.toLowerCase()}`];
    return defauts.find((d) => N(d) === brut) || brut || COULEURS[i].nom;
  };
  // Textes bruts des listes (pour pouvoir taper « 1, » sans que ça saute)
  const [txtEntree, setTxtEntree] = useState(r.valeursEntree.join(', '));
  const [txtRejouer, setTxtRejouer] = useState(r.valeursRejouer.join(', '));
  const [txtDoubles, setTxtDoubles] = useState(r.doublesRejouer.join(', '));
  const [txtFaces, setTxtFaces] = useState(r.des.faces.join(', '));
  const [txtZero, setTxtZero] = useState(String(r.des.valeurZero));
  const [txtToutZero, setTxtToutZero] = useState(String(r.des.valeurToutZero));

  const maj = (f) => setR((ancien) => { const copie = JSON.parse(JSON.stringify(ancien)); f(copie); return copie; });
  const { erreurs } = normaliserRegles(r);

  return (
    <View style={{ gap: 14 }}>
      {mode === 'local' ? (
        <Carte titre={t('joueurs')}>
          <Choix options={[[2, '2'], [3, '3'], [4, '4']]} valeur={nb} onChange={setNb} />
          {Array.from({ length: nb }, (_, i) => (
            <View key={i} style={{ gap: 6 }}>
              <Champ libelle={t('joueurCouleur', { n: i + 1, couleur: traduireNom(COULEURS[i].nom, t).toLowerCase() })} value={noms[i]} maxLength={20}
                onChangeText={(t) => setNoms((l) => l.map((x, k) => (k === i ? t : x)))} />
              <Interrupteur libelle={t('jouePar')} valeur={ordi[i]}
                onChange={(v) => setOrdi((l) => l.map((x, k) => (k === i ? v : x)))} />
            </View>
          ))}
          <Texte style={{ fontWeight: '600' }}>{t('niveauOrdi')}</Texte>
          <Choix options={['facile', 'normal', 'fort'].map((n) => [n, t(n)])} valeur={niveau} onChange={setNiveau} />
        </Carte>
      ) : null}

      <Carte titre={t('plateau')}>
        <Choix options={[['croix', t('enCroix')], ['carre', t('carre')]]} valeur={r.forme} onChange={(v) => maj((x) => { x.forme = v; })} />
        {r.forme === 'carre' ? (
          <Choix options={TAILLES.map((t) => [t, `${t} × ${t}`])} valeur={r.taille} onChange={(v) => maj((x) => { x.taille = v; })} />
        ) : null}
        <Texte style={{ fontWeight: '600' }}>{t('pionsParJoueur')}</Texte>
        <Choix options={[1, 2, 3, 4, 5, 6, 8, 10, 12].map((v) => [v, String(v)])} valeur={r.nbPions} onChange={(v) => maj((x) => { x.nbPions = v; })} />
      </Carte>

      <Carte titre={t('lancerLegende')}>
        <Choix
          options={[['desLongs', t('desLongs')], ['cauris', t('cauris')]]}
          valeur={r.des.type}
          onChange={(v) => {
            maj((x) => {
              x.des.type = v;
              x.valeursEntree = [...PRESETS_DES[v].valeursEntree];
              x.valeursRejouer = [...PRESETS_DES[v].valeursRejouer];
              x.doublesRejouer = [...PRESETS_DES[v].doublesRejouer];
            });
            setTxtEntree(PRESETS_DES[v].valeursEntree.join(', '));
            setTxtRejouer(PRESETS_DES[v].valeursRejouer.join(', '));
            setTxtDoubles(PRESETS_DES[v].doublesRejouer.join(', '));
          }}
        />
        {r.des.type === 'cauris' ? (
          <>
            <Texte style={{ fontWeight: '600' }}>{t('nbCauris')}</Texte>
            <Choix options={[2, 3, 4, 5, 6, 7].map((v) => [v, String(v)])} valeur={r.des.nbCauris}
              onChange={(v) => maj((x) => { x.des.nbCauris = v; })} />
            <Champ libelle={t('valeurZeroCauri')} keyboardType="number-pad" value={txtZero}
              aide={t('aideCauri')}
              onChangeText={(t) => { setTxtZero(t); maj((x) => { x.des.valeurZero = Number(t); }); }} />
          </>
        ) : (
          <>
            <Texte style={{ fontWeight: '600' }}>{t('nbDes')}</Texte>
            <Choix options={[[1, '1'], [2, '2'], [3, '3']]} valeur={r.des.nbDes} onChange={(v) => maj((x) => { x.des.nbDes = v; })} />
            <Champ libelle={t('faces')} value={txtFaces} aide={t('aideFaces')}
              onChangeText={(t) => { setTxtFaces(t); maj((x) => { x.des.faces = lireListe(t); }); }} />
            <Champ libelle={t('toutZero')} keyboardType="number-pad" value={txtToutZero} aide={t('aideToutZero')}
              onChangeText={(t) => { setTxtToutZero(t); maj((x) => { x.des.valeurToutZero = Number(t); }); }} />
            <Champ libelle={t('doubles')} value={txtDoubles}
              aide={t('aideDoubles')}
              onChangeText={(t) => { setTxtDoubles(t); maj((x) => { x.doublesRejouer = lireListe(t); }); }} />
          </>
        )}
        <Texte attenue style={{ fontSize: 12 }}>{t('valeursPossibles', { v: valeursPossibles(r).join(', ') })}</Texte>
        <Champ libelle={t('valeursEntree')} value={txtEntree}
          onChangeText={(t) => { setTxtEntree(t); maj((x) => { x.valeursEntree = lireListe(t); }); }} />
        <Champ libelle={t('valeursRejouer')} value={txtRejouer}
          onChangeText={(t) => { setTxtRejouer(t); maj((x) => { x.valeursRejouer = lireListe(t); }); }} />
      </Carte>

      {/* Déplacements : règles fixes (REGLES_FIXES), plus de choix à faire */}
      {r.forme === 'carre' ? (
        <Carte titre={t('refuges')}>
          <Texte attenue style={{ fontSize: 12 }}>{t('aideRefuges')}</Texte>
          <Interrupteur libelle={t('coins2')} valeur={r.refuges.coinsDeuxiemeAnneau}
            onChange={(v) => maj((x) => { x.refuges.coinsDeuxiemeAnneau = v; })} />
          <Interrupteur libelle={t('milieux')} valeur={r.refuges.milieuxInterieurs}
            onChange={(v) => maj((x) => { x.refuges.milieuxInterieurs = v; })} />
        </Carte>
      ) : null}

      {erreurs.length ? <Texte erreur>{erreurs.map((e) => traduireErreur(e, t)).join(' ')}</Texte> : null}
      {erreurServeur ? <Texte erreur>{erreurServeur}</Texte> : null}
      <Bouton
        principal
        titre={occupe ? t('patiente') : mode === 'local' ? t('commencer') : t('creerLaPartie')}
        desactive={erreurs.length > 0 || occupe}
        onPress={() =>
          surValider(
            avecReglesFixes(normaliserRegles(r).regles),
            noms.slice(0, nb).map((x, i) => ({ nom: nomCanonique(x, i), ordi: ordi[i] ? niveau : false }))
          )
        }
      />
    </View>
  );
}
