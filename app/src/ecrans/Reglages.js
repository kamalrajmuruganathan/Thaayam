import React, { useState } from 'react';
import { View } from 'react-native';
import { Bouton, Carte, Champ, Choix, Interrupteur, Texte } from '../ui';
import {
  COULEURS, PRESETS_DES, TAILLES, lireListe, normaliserRegles, valeursPossibles,
} from '../../../moteur/regles.js';

/** Formulaire de toutes les règles. mode : 'local' ou 'ligne'. */
export default function Reglages({ mode, reglesInitiales, ordiInitial, pseudo, surValider, occupe, erreurServeur }) {
  const [r, setR] = useState(reglesInitiales);
  const [nb, setNb] = useState(2);
  const [ordi, setOrdi] = useState(ordiInitial || [false, false, false, false]);
  const [noms, setNoms] = useState(COULEURS.map((c, i) =>
    (ordi[i] ? `Ordi ${c.nom.toLowerCase()}` : i === 0 && pseudo ? pseudo : c.nom)));
  // Textes bruts des listes (pour pouvoir taper « 1, » sans que ça saute)
  const [txtEntree, setTxtEntree] = useState(r.valeursEntree.join(', '));
  const [txtRejouer, setTxtRejouer] = useState(r.valeursRejouer.join(', '));
  const [txtFaces, setTxtFaces] = useState(r.des.faces.join(', '));
  const [txtZero, setTxtZero] = useState(String(r.des.valeurZero));
  const [txtToutZero, setTxtToutZero] = useState(String(r.des.valeurToutZero));

  const maj = (f) => setR((ancien) => { const copie = JSON.parse(JSON.stringify(ancien)); f(copie); return copie; });
  const { erreurs } = normaliserRegles(r);

  return (
    <View style={{ gap: 14 }}>
      {mode === 'local' ? (
        <Carte titre="Joueurs">
          <Choix options={[[2, '2'], [3, '3'], [4, '4']]} valeur={nb} onChange={setNb} />
          {Array.from({ length: nb }, (_, i) => (
            <View key={i} style={{ gap: 6 }}>
              <Champ libelle={`Joueur ${i + 1} (${COULEURS[i].nom.toLowerCase()})`} value={noms[i]} maxLength={20}
                onChangeText={(t) => setNoms((l) => l.map((x, k) => (k === i ? t : x)))} />
              <Interrupteur libelle="Joué par l'ordinateur" valeur={ordi[i]}
                onChange={(v) => setOrdi((l) => l.map((x, k) => (k === i ? v : x)))} />
            </View>
          ))}
        </Carte>
      ) : null}

      <Carte titre="Plateau">
        <Choix options={[['croix', 'En croix'], ['carre', 'Carré']]} valeur={r.forme} onChange={(v) => maj((x) => { x.forme = v; })} />
        {r.forme === 'carre' ? (
          <Choix options={TAILLES.map((t) => [t, `${t} × ${t}`])} valeur={r.taille} onChange={(v) => maj((x) => { x.taille = v; })} />
        ) : null}
        <Texte style={{ fontWeight: '600' }}>Pions par joueur</Texte>
        <Choix options={[1, 2, 3, 4, 5, 6, 8, 10, 12].map((v) => [v, String(v)])} valeur={r.nbPions} onChange={(v) => maj((x) => { x.nbPions = v; })} />
      </Carte>

      <Carte titre="Lancer">
        <Choix
          options={[['desLongs', 'Dés longs'], ['cauris', 'Cauris']]}
          valeur={r.des.type}
          onChange={(v) => {
            maj((x) => {
              x.des.type = v;
              x.valeursEntree = [...PRESETS_DES[v].valeursEntree];
              x.valeursRejouer = [...PRESETS_DES[v].valeursRejouer];
            });
            setTxtEntree(PRESETS_DES[v].valeursEntree.join(', '));
            setTxtRejouer(PRESETS_DES[v].valeursRejouer.join(', '));
          }}
        />
        {r.des.type === 'cauris' ? (
          <>
            <Texte style={{ fontWeight: '600' }}>Nombre de cauris</Texte>
            <Choix options={[2, 3, 4, 5, 6, 7].map((v) => [v, String(v)])} valeur={r.des.nbCauris}
              onChange={(v) => maj((x) => { x.des.nbCauris = v; })} />
            <Champ libelle="Valeur quand aucun cauri ne tombe ouvert" keyboardType="number-pad" value={txtZero}
              aide="Souvent 8 avec 4 cauris, 12 avec 6 cauris."
              onChangeText={(t) => { setTxtZero(t); maj((x) => { x.des.valeurZero = Number(t); }); }} />
          </>
        ) : (
          <>
            <Texte style={{ fontWeight: '600' }}>Nombre de dés longs</Texte>
            <Choix options={[[1, '1'], [2, '2'], [3, '3']]} valeur={r.des.nbDes} onChange={(v) => maj((x) => { x.des.nbDes = v; })} />
            <Champ libelle="Valeurs des faces de chaque dé" value={txtFaces} aide="Séparées par des virgules. Dayakattai classique : 0, 1, 2, 3."
              onChangeText={(t) => { setTxtFaces(t); maj((x) => { x.des.faces = lireListe(t); }); }} />
            <Champ libelle="Valeur quand tous les dés montrent 0" keyboardType="number-pad" value={txtToutZero} aide="Classique : 0 + 0 = 12."
              onChangeText={(t) => { setTxtToutZero(t); maj((x) => { x.des.valeurToutZero = Number(t); }); }} />
          </>
        )}
        <Texte attenue style={{ fontSize: 12 }}>Valeurs possibles avec ces dés : {valeursPossibles(r).join(', ')}</Texte>
        <Champ libelle="Valeurs qui font entrer un pion (« thaayam »)" value={txtEntree}
          onChangeText={(t) => { setTxtEntree(t); maj((x) => { x.valeursEntree = lireListe(t); }); }} />
        <Champ libelle="Valeurs qui font rejouer" value={txtRejouer}
          onChangeText={(t) => { setTxtRejouer(t); maj((x) => { x.valeursRejouer = lireListe(t); }); }} />
        <Interrupteur libelle="On rejoue aussi après une capture" valeur={r.rejouerApresCapture}
          onChange={(v) => maj((x) => { x.rejouerApresCapture = v; })} />
      </Carte>

      <Carte titre="Déplacements">
        <Interrupteur libelle="Il faut avoir capturé un pion pour entrer à l'intérieur"
          aide="Sinon, les pions refont le tour du plateau."
          valeur={r.captureAvantInterieur} onChange={(v) => maj((x) => { x.captureAvantInterieur = v; })} />
        <Interrupteur libelle="Il faut tomber pile sur le centre" valeur={r.arriveeExacte}
          onChange={(v) => maj((x) => { x.arriveeExacte = v; })} />
        <Interrupteur libelle="Un seul pion par case (sauf sur les croix)" valeur={r.unPionParCase}
          aide="Deux pions du même joueur ne peuvent pas partager une case ordinaire."
          onChange={(v) => maj((x) => { x.unPionParCase = v; })} />
        <Texte style={{ fontWeight: '600' }}>Sens du tour</Texte>
        <Choix options={[['anti-horaire', '↺ Anti-horaire'], ['horaire', '↻ Horaire']]} valeur={r.sens}
          onChange={(v) => maj((x) => { x.sens = v; })} />
        {r.forme === 'carre' ? (
          <>
            <Texte style={{ fontWeight: '600' }}>Sens des anneaux intérieurs</Texte>
            <Choix options={[['inverse', 'Inverse (classique)'], ['meme', 'Même sens'], ['alterne', 'Alterné']]} valeur={r.sensInterieurs}
              onChange={(v) => maj((x) => { x.sensInterieurs = v; })} />
          </>
        ) : null}
      </Carte>

      {r.forme === 'carre' ? (
        <Carte titre="Cases refuges (croix)">
          <Texte attenue style={{ fontSize: 12 }}>Les cases de départ et le centre sont toujours des refuges.</Texte>
          <Interrupteur libelle="Coins du 2e anneau (classique)" valeur={r.refuges.coinsDeuxiemeAnneau}
            onChange={(v) => maj((x) => { x.refuges.coinsDeuxiemeAnneau = v; })} />
          <Interrupteur libelle="Milieux des anneaux intérieurs" valeur={r.refuges.milieuxInterieurs}
            onChange={(v) => maj((x) => { x.refuges.milieuxInterieurs = v; })} />
        </Carte>
      ) : null}

      {erreurs.length ? <Texte erreur>{erreurs.join(' ')}</Texte> : null}
      {erreurServeur ? <Texte erreur>{erreurServeur}</Texte> : null}
      <Bouton
        principal
        titre={occupe ? 'Patiente…' : mode === 'local' ? 'Commencer' : 'Créer la partie'}
        desactive={erreurs.length > 0 || occupe}
        onPress={() =>
          surValider(
            normaliserRegles(r).regles,
            noms.slice(0, nb).map((x, i) => ({ nom: x.trim() || COULEURS[i].nom, ordi: ordi[i] }))
          )
        }
      />
    </View>
  );
}
