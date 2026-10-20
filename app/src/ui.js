import React, { createContext, useContext } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet, useColorScheme } from 'react-native';
import { traducteur } from '../../moteur/i18n.js';

const CLAIR = {
  fond: '#f6efe3', surface: '#fffaf1', texte: '#2b1d10', attenue: '#7a6650',
  accent: '#7a3e12', accentTexte: '#fff8ec', trait: '#d9c6a8', erreur: '#b3261e',
};
const SOMBRE = {
  fond: '#1d1611', surface: '#2a2019', texte: '#f3e7d4', attenue: '#b9a68c',
  accent: '#e0a15c', accentTexte: '#1d1611', trait: '#4a3a2c', erreur: '#ff8a80',
};

// Thème « Cristal » : tableau de bord haut de gamme (verre fumé, cyan, blanc)
const CRISTAL = {
  fond: '#04070b', surface: '#0e1822', texte: '#e9f3fb', attenue: '#8ea7b9',
  accent: '#7fdcff', accentTexte: '#03121c', trait: '#1f4a63', erreur: '#ff5a5a', cyan: '#5fd4ff',
};

// Thème « Temple » : pierre claire et dorures
const TEMPLE = {
  fond: '#e9dfcb', surface: '#f6efe1', texte: '#2a2118', attenue: '#6f5f48',
  accent: '#9a6a12', accentTexte: '#fff8e6', trait: '#c9b48e', erreur: '#b3261e', or: '#d9a520',
};
// Thème « Nuit » : néons violets et roses sur fond noir
const NUIT = {
  fond: '#06020d', surface: '#160a2a', texte: '#f6e9ff', attenue: '#b49ccc',
  accent: '#ff4fd8', accentTexte: '#1a0517', trait: '#4a2a7a', erreur: '#ff6b8b', cyan: '#b678ff',
};

/** Couleurs des dés longs selon le thème : { fond, bord, point, valeur, epais }. */
export function couleursDes(theme) {
  if (theme === 'cristal') return { fond: '#0d1a25', bord: '#5fd4ff', point: '#5fd4ff', valeur: '#f2f8fc', epais: 1 };
  if (theme === 'nuit') return { fond: '#12061f', bord: '#ff4fd8', point: '#ff8ae5', valeur: '#ffffff', epais: 1 };
  if (theme === 'temple') return { fond: '#e6dac3', bord: '#6b5536', point: '#9a6a12', valeur: '#9a6a12', epais: 2 };
  return { fond: '#d9a845', bord: '#7a5418', point: '#3b2410', valeur: '#7a3e12', epais: 2 };
}
/** Thèmes sombres et lumineux (halo, ambiance futuriste). */
export const themeLumineux = (theme) => theme === 'cristal' || theme === 'nuit';

/** Langue choisie ('fr', 'en', 'ta', 'hi', 'si'), fournie par App.js : useT() renvoie t(cle, params). */
export const LangueContexte = createContext(traducteur('fr'));
export function useT() {
  return useContext(LangueContexte);
}

/** Thème choisi ('cristal', 'temple', 'nuit' ou 'bois'), fourni par App.js. */
export const ThemeContexte = createContext('cristal');
export function useTheme() {
  return useContext(ThemeContexte);
}

export function useCouleurs() {
  const theme = useTheme();
  const schema = useColorScheme();
  if (theme === 'cristal') return CRISTAL;
  if (theme === 'nuit') return NUIT;
  if (theme === 'temple') return TEMPLE;
  return schema === 'dark' ? SOMBRE : CLAIR;
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
  const theme = useTheme();
  const lumineux = themeLumineux(theme);
  return (
    <View style={[s.carte, { backgroundColor: c.surface, borderColor: c.trait },
      lumineux && { shadowColor: c.cyan || c.accent, shadowOpacity: 0.25, shadowRadius: 14, elevation: 4 },
      theme === 'temple' && { shadowColor: '#503c1e', shadowOpacity: 0.18, shadowRadius: 8, elevation: 2 }]}>
      {/* Arête lumineuse en haut de la carte, comme une vitre éclairée */}
      {lumineux ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        backgroundColor: theme === 'nuit' ? '#ffb8f1' : '#bff0ff', shadowColor: c.cyan, shadowOpacity: 0.9, shadowRadius: 6 }} /> : null}
      {theme === 'temple' ? <View pointerEvents="none" style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3,
        borderRadius: 11, borderWidth: 1, borderColor: 'rgba(217,165,32,0.35)' }} /> : null}
      {titre ? <Text style={[s.titreCarte, { color: lumineux ? (c.cyan || c.accent) : theme === 'temple' ? '#7a520c' : c.texte }]}>{titre}</Text> : null}
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
