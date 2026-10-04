/**
 * Client Supabase + module de jeu en ligne partagé avec la page web.
 * Clé PUBLIQUE (publishable) : sans danger côté client, protégée par RLS.
 * Ne JAMAIS mettre ici une clé sb_secret_.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { creerEnLigne } from '../../moteur/en-ligne.js';

const SUPABASE_URL = 'https://zxhxevucpuudknyfidla.supabase.co';
const SUPABASE_CLE_PUBLIQUE = 'sb_publishable_07OkmTas1JvRtODtJlWCzQ_uSX6Wre-';

const client = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const stockage = {
  lire: (k) => AsyncStorage.getItem(k),
  ecrire: (k, v) => AsyncStorage.setItem(k, v),
};

export const enLigne = creerEnLigne(client, stockage);
