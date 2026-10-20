/**
 * Notifications de l'appli (Android / iPhone) : « C'est ton tour » et invitations d'amis,
 * même quand l'appli est fermée. Elles passent par le service de notifications d'Expo :
 * il faut que l'appli ait été construite avec EAS (identifiant de projet dans app.json → extra.eas.projectId).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { enLigne, stockage } from './enLigne';

// Appli ouverte : pas de bandeau « C'est ton tour » (l'écran de jeu le montre déjà), mais les invitations s'affichent.
try {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const tour = (n.request.content.data || {}).type === 'tour';
      return { shouldShowBanner: !tour, shouldShowList: true, shouldPlaySound: !tour, shouldSetBadge: false };
    },
  });
} catch { /* web */ }

export const notifsPossibles = () => Platform.OS !== 'web' && Device.isDevice;
const projetEas = () => (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.eas
  && Constants.expoConfig.extra.eas.projectId) || (Constants.easConfig && Constants.easConfig.projectId) || null;

async function appareilId() {
  let id = await stockage.lire('thaayam:appareil');
  if (!id) {
    id = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await stockage.ecrire('thaayam:appareil', id);
  }
  return id;
}

export async function notifsActives() {
  return notifsPossibles() && (await stockage.lire('thaayam:notifs')) === 'oui';
}

/** Active les notifications. Renvoie 'ok', 'indispo', 'refusees' ou 'pasPretes'. */
export async function activerNotifs(pseudo, langue) {
  if (!notifsPossibles()) return 'indispo';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Thaayam', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 80, 40, 80],
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return 'refusees';
  const projectId = projetEas();
  if (!projectId) return 'pasPretes';
  const jeton = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!(await enLigne.profilLocal())) await enLigne.profil(pseudo);
  await enLigne.abonner(await appareilId(), 'expo', jeton, langue);
  await stockage.ecrire('thaayam:notifs', 'oui');
  return 'ok';
}

export async function couperNotifs(langue) {
  await stockage.ecrire('thaayam:notifs', 'non');
  try { await enLigne.abonner(await appareilId(), 'expo', null, langue); } catch { /* hors ligne */ }
}

/** Quand on touche une notification : surCode(code de la partie). Renvoie une fonction d'arrêt. */
export function ecouterOuvertures(surCode) {
  if (Platform.OS === 'web') return () => {};
  const lire = (r) => {
    const code = r && r.notification && (r.notification.request.content.data || {}).code;
    if (code) surCode(code);
  };
  Notifications.getLastNotificationResponseAsync().then(lire).catch(() => {});
  const abonnement = Notifications.addNotificationResponseReceivedListener(lire);
  return () => abonnement.remove();
}
