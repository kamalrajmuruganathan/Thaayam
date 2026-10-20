import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { Bouton, Carte, Texte, useCouleurs, useT } from '../ui';
import { enLigne } from '../enLigne';
import { COULEURS } from '../../../moteur/regles.js';
import { traduireErreur } from '../../../moteur/i18n.js';

const EMOJIS = ['😀', '😂', '😍', '😎', '😮', '😢', '😡', '👍', '👏', '🔥', '🎉', '🙏', '💪', '❤️'];
// Message fait seulement d'un emoji (court, sans lettre ni chiffre, avec un caractère emoji)
const EMOJI_SEUL = { test: (x) => Array.from(x).length <= 4 && !/[A-Za-z0-9\u00C0-\u024F\u0900-\u097F\u0B80-\u0BFF\u0D80-\u0DFF]/.test(x)
  && /[\u2600-\u27BF\uD83C-\uDBFF]/.test(x) };

/** Un emoji qui s'envole du bas de l'écran. */
function EmojiVolant({ texte, gauche, retard, surFin }) {
  const { height } = useWindowDimensions();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 2600, delay: retard, useNativeDriver: true }).start(surFin);
  }, []);
  return (
    <Animated.Text style={{ position: 'absolute', bottom: -40, left: gauche, fontSize: 44,
      opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.8] }) },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] }) }] }}>
      {texte}
    </Animated.Text>
  );
}

/** Emojis qui s'envolent par-dessus tout l'écran (à placer à la racine). */
export function CoucheEmojis({ volants, retirer }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      {volants.map((e) => <EmojiVolant key={e.id} texte={e.texte} gauche={e.gauche} retard={e.retard} surFin={() => retirer(e.id)} />)}
    </View>
  );
}

/**
 * Discussion d'une partie en ligne : messages écrits et emojis.
 * nomDe(place) : nom affiché d'un joueur ; surEmoji(texte) : un emoji vient d'arriver (pour le faire s'envoler).
 */
export default function Discussion({ code, jeton, place, nomDe, surEmoji }) {
  const c = useCouleurs();
  const t = useT();
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState('');
  const defilement = useRef(null);

  useEffect(() => {
    let actif = true;
    const ajouter = (m, nouveau) => {
      setMessages((l) => (l.some((x) => x.id === m.id) ? l : [...l, m].sort((a, b) => a.id - b.id).slice(-200)));
      if (nouveau && EMOJI_SEUL.test(m.texte)) surEmoji(m.texte);
    };
    setMessages([]);
    const arret = enLigne.suivreMessages(code, (m) => actif && ajouter(m, true));
    enLigne.messages(code).then((l) => actif && l.forEach((m) => ajouter(m, false))).catch(() => {});
    return () => { actif = false; arret(); };
  }, [code]);

  async function envoyer(contenu) {
    if (!contenu.trim()) return;
    try {
      await enLigne.ecrire(code, jeton, contenu);
      setErreur('');
      if (contenu === texte) setTexte('');
    } catch (e) {
      setErreur(traduireErreur(e.message, t));
    }
  }

  return (
    <>
      <Carte titre={t('discussionTitre')}>
        <ScrollView ref={defilement} style={{ maxHeight: 260 }} nestedScrollEnabled
          onContentSizeChange={() => defilement.current && defilement.current.scrollToEnd({ animated: true })}>
          {!messages.length ? <Texte attenue>{t('aucunMessage')}</Texte> : null}
          {messages.map((m) => {
            const moi = m.place === place;
            const emoji = EMOJI_SEUL.test(m.texte);
            return (
              <View key={m.id} style={{ alignSelf: moi ? 'flex-end' : 'flex-start', maxWidth: '88%', marginBottom: 6, paddingVertical: 6,
                paddingHorizontal: 10, borderRadius: 12, backgroundColor: moi ? `${c.accent}33` : c.fond }}>
                <Texte style={{ fontSize: 12, fontWeight: '700', color: COULEURS[m.place] ? COULEURS[m.place].code : c.attenue }}>
                  {moi ? t('moi') : nomDe(m.place)}
                </Texte>
                <Texte selectable style={{ fontSize: emoji ? 32 : 15 }}>{m.texte}</Texte>
              </View>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => envoyer(e)} accessibilityRole="button" accessibilityLabel={e}
              style={{ minWidth: 42, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: c.trait }}>
              <Texte style={{ fontSize: 22 }}>{e}</Texte>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={texte} onChangeText={setTexte} maxLength={300} placeholder={t('ecrireMessage')} placeholderTextColor={c.attenue}
            onSubmitEditing={() => envoyer(texte)} returnKeyType="send"
            style={{ flex: 1, borderWidth: 1, borderRadius: 10, borderColor: c.trait, color: c.texte, backgroundColor: c.surface, paddingHorizontal: 12, minHeight: 44 }} />
          <Bouton principal titre={t('envoyer')} onPress={() => envoyer(texte)} />
        </View>
        {erreur ? <Texte erreur>{erreur}</Texte> : null}
      </Carte>
      <Carte titre={t('appelTitre')}>
        <Texte attenue>{t('appelAppli')}</Texte>
      </Carte>
    </>
  );
}
