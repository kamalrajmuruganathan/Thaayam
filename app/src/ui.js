import React from 'react';
import { Pressable, Text, TextInput, View, StyleSheet, useColorScheme } from 'react-native';

const CLAIR = {
  fond: '#f6efe3', surface: '#fffaf1', texte: '#2b1d10', attenue: '#7a6650',
  accent: '#7a3e12', accentTexte: '#fff8ec', trait: '#d9c6a8', erreur: '#b3261e',
};
const SOMBRE = {
  fond: '#1d1611', surface: '#2a2019', texte: '#f3e7d4', attenue: '#b9a68c',
  accent: '#e0a15c', accentTexte: '#1d1611', trait: '#4a3a2c', erreur: '#ff8a80',
};

export function useCouleurs() {
  return useColorScheme() === 'dark' ? SOMBRE : CLAIR;
}

export function Bouton({ titre, onPress, principal, desactive, style }) {
  const c = useCouleurs();
  return (
    <Pressable
      onPress={desactive ? undefined : onPress}
      style={({ pressed }) => [
        s.bouton,
        { backgroundColor: principal ? c.accent : c.surface, borderColor: principal ? c.accent : c.trait },
        desactive && { opacity: 0.45 },
        pressed && !desactive && { opacity: 0.75 },
        style,
      ]}
    >
      <Text style={[s.boutonTexte, { color: principal ? c.accentTexte : c.texte }]}>{titre}</Text>
    </Pressable>
  );
}

export function Choix({ options, valeur, onChange }) {
  const c = useCouleurs();
  return (
    <View style={s.ligne}>
      {options.map(([v, t]) => {
        const actif = v === valeur;
        return (
          <Pressable
            key={String(v)}
            onPress={() => onChange(v)}
            style={[s.choix, { borderColor: actif ? c.accent : c.trait, backgroundColor: actif ? c.accent : c.surface }]}
          >
            <Text style={{ color: actif ? c.accentTexte : c.texte, fontWeight: '700' }}>{t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Champ({ libelle, aide, ...props }) {
  const c = useCouleurs();
  return (
    <View style={{ gap: 4 }}>
      {libelle ? <Text style={{ color: c.texte, fontWeight: '600' }}>{libelle}</Text> : null}
      <TextInput
        placeholderTextColor={c.attenue}
        {...props}
        style={[s.champ, { color: c.texte, borderColor: c.trait, backgroundColor: c.surface }, props.style]}
      />
      {aide ? <Text style={{ color: c.attenue, fontSize: 12 }}>{aide}</Text> : null}
    </View>
  );
}

export function Interrupteur({ libelle, aide, valeur, onChange }) {
  const c = useCouleurs();
  return (
    <Pressable onPress={() => onChange(!valeur)} style={[s.ligne, { alignItems: 'center', flexWrap: 'nowrap' }]}>
      <View style={[s.coche, { borderColor: c.accent, backgroundColor: valeur ? c.accent : 'transparent' }]}>
        {valeur ? <Text style={{ color: c.accentTexte, fontWeight: '900' }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.texte }}>{libelle}</Text>
        {aide ? <Text style={{ color: c.attenue, fontSize: 12 }}>{aide}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Carte({ titre, children }) {
  const c = useCouleurs();
  return (
    <View style={[s.carte, { backgroundColor: c.surface, borderColor: c.trait }]}>
      {titre ? <Text style={[s.titreCarte, { color: c.texte }]}>{titre}</Text> : null}
      {children}
    </View>
  );
}

export function Texte({ style, attenue, erreur, ...props }) {
  const c = useCouleurs();
  return <Text {...props} style={[{ color: erreur ? c.erreur : attenue ? c.attenue : c.texte }, style]} />;
}

export const s = StyleSheet.create({
  bouton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  boutonTexte: { fontWeight: '700', fontSize: 16 },
  ligne: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  choix: { flex: 1, minWidth: 70, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  champ: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 44 },
  coche: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  carte: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  titreCarte: { fontSize: 17, fontWeight: '700' },
});
