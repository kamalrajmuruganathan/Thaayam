import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Bouton, Carte, Texte, useCouleurs, useT } from '../ui';
import { enLigne } from '../enLigne';
import { creerAppel, appelsPossibles } from '../appel';
import { RTCView } from '../rtc';

/** Demande l'accord du joueur avant d'allumer le micro ou la caméra. */
function confirmer(texte, t) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(texte));
  return new Promise((ok) => Alert.alert(t('appelTitre'), texte, [
    { text: t('refuser'), style: 'cancel', onPress: () => ok(false) },
    { text: t('accepter'), onPress: () => ok(true) },
  ], { cancelable: true, onDismiss: () => ok(false) }));
}

/** Vidéo (ou son seul) d'un joueur. */
function Flux({ flux, miroir, hauteur }) {
  const ref = useRef(null);
  useEffect(() => {
    if (Platform.OS === 'web' && ref.current && ref.current.srcObject !== flux) ref.current.srcObject = flux;
  }, [flux]);
  if (!flux) return null;
  if (Platform.OS === 'web') {
    return React.createElement('video', {
      ref, autoPlay: true, playsInline: true, muted: !!miroir,
      style: { width: '100%', height: hauteur, objectFit: 'cover', borderRadius: 10, background: '#000', transform: miroir ? 'scaleX(-1)' : undefined },
    });
  }
  return <RTCView streamURL={flux.toURL()} objectFit="cover" mirror={!!miroir} style={{ width: '100%', height: hauteur, borderRadius: 10, backgroundColor: '#000' }} />;
}

/** Appels audio / vidéo entre les joueurs d'une partie en ligne (mêmes messages que le site). */
export default function Appel({ code, jeton, place, nomDe }) {
  const c = useCouleurs();
  const t = useT();
  const [, rafraichir] = useReducer((x) => x + 1, 0);
  const [sonnerie, setSonnerie] = useState(null);
  const [erreur, setErreur] = useState('');
  const appel = useRef(null);

  useEffect(() => {
    if (!appelsPossibles()) return undefined;
    let canal = null;
    try {
      canal = enLigne.canalAppel(code, (m) => { if (appel.current) appel.current.recevoir(m); });
      appel.current = creerAppel({
        canal, place, nom: nomDe(place), surChange: rafraichir, surSonnerie: setSonnerie,
        serveurs: () => enLigne.serveursAppel(code, jeton),
      });
    } catch { /* hors ligne */ }
    return () => {
      try { if (appel.current) appel.current.raccrocher(); } catch { /* déjà fini */ }
      appel.current = null;
      if (canal) canal.arreter();
    };
  }, [code, place]);

  async function entrer(video, accepter) {
    if (!appel.current) return;
    if (!(await confirmer(video ? t('confirmerCamera') : t('confirmerMicro'), t))) return;
    setErreur('');
    try {
      if (accepter) await appel.current.accepter(video);
      else await appel.current.demarrer(video);
    } catch {
      setErreur(t('appelPermission'));
      setSonnerie(null);
    }
  }

  if (!appelsPossibles()) {
    return <Carte titre={t('appelTitre')}><Texte attenue>{t('appelIndispo')}</Texte></Carte>;
  }
  const a = appel.current ? appel.current.etat : null;
  const actif = !!(a && a.actif);
  const pairs = a ? [...a.pairs.entries()] : [];
  const nomSonnerie = sonnerie ? (sonnerie.nom || nomDe(sonnerie.de)) : '';

  return (
    <Carte titre={t('appelTitre')}>
      {!actif && !sonnerie ? (
        <>
          <Texte attenue>{t('appelAide')}</Texte>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Bouton style={{ flex: 1 }} titre={t('appelVocal')} onPress={() => entrer(false, false)} />
            <Bouton style={{ flex: 1 }} titre={t('appelVideo')} onPress={() => entrer(true, false)} />
          </View>
        </>
      ) : null}
      {!actif && sonnerie ? (
        <View style={{ gap: 8, borderWidth: 2, borderColor: c.accent, borderRadius: 12, padding: 10 }}>
          <Texte style={{ fontWeight: '800', textAlign: 'center' }}>
            {sonnerie.enCours ? t('enAppel', { nom: nomSonnerie }) : sonnerie.video ? t('tAppelleVideo', { nom: nomSonnerie }) : t('tAppelle', { nom: nomSonnerie })}
          </Texte>
          <Bouton principal titre={t('accepter')} onPress={() => entrer(false, true)} />
          <Bouton titre={t('accepterVideo')} onPress={() => entrer(true, true)} />
          <Bouton titre={t('refuser')} onPress={() => { if (appel.current) appel.current.refuser(); else setSonnerie(null); }} />
        </View>
      ) : null}
      {actif ? (
        <>
          {!pairs.length ? <Texte attenue>{t('appelAttente')}</Texte> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {pairs.map(([x, p]) => (
              <View key={x} style={{ flexBasis: '47%', flexGrow: 1, gap: 4 }}>
                {p.flux && a.video ? <Flux flux={p.flux} hauteur={150} /> : (
                  <View style={{ height: 60, borderRadius: 10, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Texte style={{ fontSize: 22 }}>🔊</Texte>
                    {Platform.OS === 'web' && p.flux ? <Flux flux={p.flux} hauteur={1} /> : null}
                  </View>
                )}
                <Texte style={{ fontSize: 12, textAlign: 'center' }}>{nomDe(x)}</Texte>
              </View>
            ))}
            {a.video && a.local ? (
              <View style={{ flexBasis: '47%', flexGrow: 1, gap: 4 }}>
                <Flux flux={a.local} miroir hauteur={150} />
                <Texte style={{ fontSize: 12, textAlign: 'center' }}>{t('moi')}</Texte>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Bouton style={{ flex: 1 }} titre={a.micro ? t('micOui') : t('micNon')} onPress={() => appel.current.basculerMicro()} />
            {a.video ? <Bouton style={{ flex: 1 }} titre={a.camera ? t('camOui') : t('camNon')} onPress={() => appel.current.basculerCamera()} /> : null}
            <Bouton style={{ flex: 1 }} titre={t('raccrocher')} onPress={() => appel.current.raccrocher()} />
          </View>
        </>
      ) : null}
      {erreur ? <Texte erreur>{erreur}</Texte> : null}
    </Carte>
  );
}
