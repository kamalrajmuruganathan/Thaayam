// Fonction Edge Supabase « thaayam-notifier » : envoie les notifications du jeu.
// - « C'est ton tour » et « X t'invite », demandées par la base (déclencheurs de supabase/thaayam.sql).
// - Navigateurs : notifications web (Web Push, clés VAPID créées ici au premier appel et rangées
//   dans la table privée thaayam_config).
// - Appli Android : Firebase Cloud Messaging en direct (type « fcm », secret FCM_COMPTE_SERVICE) ;
//   appli construite avec EAS : service de notifications d'Expo (type « expo »).
// - Appels audio / vidéo : identifiants des serveurs relais TURN (ExpressTURN, Metered et/ou Cloudflare),
//   donnés seulement aux joueurs d'une partie (voir plus bas les secrets à régler).
// À déployer une fois : Supabase → Edge Functions → Deploy a new function → Via Editor,
// nom « thaayam-notifier », coller ce fichier, puis désactiver « Verify JWT » dans ses réglages.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://thaayam.kamalraj-28.workers.dev';

const TEXTES: Record<string, { tour: string; invitation: string }> = {
  fr: { tour: "C'est ton tour ! (partie {code})", invitation: "{de} t'invite à jouer (partie {code})" },
  en: { tour: "It's your turn! (game {code})", invitation: '{de} invites you to play (game {code})' },
  ta: { tour: 'உங்கள் முறை! (ஆட்டம் {code})', invitation: '{de} உங்களை விளையாட அழைக்கிறார் (ஆட்டம் {code})' },
  hi: { tour: 'आपकी बारी! (खेल {code})', invitation: '{de} आपको खेलने के लिए बुला रहे हैं (खेल {code})' },
  si: { tour: 'ඔබගේ වාරය! (ක්‍රීඩාව {code})', invitation: '{de} ඔබට ක්‍රීඩා කිරීමට ආරාධනා කරයි (ක්‍රීඩාව {code})' },
};

function texte(langue: string, type: 'tour' | 'invitation', params: Record<string, string>) {
  const modele = (TEXTES[langue] || TEXTES.fr)[type];
  return modele.replace(/\{(\w+)\}/g, (m, k) => params[k] ?? m);
}

// ---------------------------------------------------------------- Firebase (notifications Android directes)
// Compte de service Firebase (fichier JSON de la console : Paramètres du projet → Comptes de service → Générer
// une nouvelle clé privée), dans le secret FCM_COMPTE_SERVICE ou la table privée thaayam_config (fcm_compte_service).
type CompteService = { project_id: string; client_email: string; private_key: string };
let jetonFcmCache: { jeton: string; expire: number } | null = null;
const b64url = (octets: Uint8Array) => btoa(String.fromCharCode(...octets)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64json = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/** Jeton d'accès Google (OAuth) pour l'API Firebase Cloud Messaging, gardé une heure. */
async function jetonFcm(compte: CompteService) {
  if (jetonFcmCache && jetonFcmCache.expire > Date.now() + 60_000) return jetonFcmCache.jeton;
  const maintenant = Math.floor(Date.now() / 1000);
  const aSigner = `${b64json({ alg: 'RS256', typ: 'JWT' })}.${b64json({
    iss: compte.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: maintenant, exp: maintenant + 3600,
  })}`;
  const pem = compte.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const cle = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(aSigner)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${aSigner}.${b64url(signature)}` }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Jeton Firebase refusé');
  jetonFcmCache = { jeton: d.access_token, expire: Date.now() + (d.expires_in || 3600) * 1000 };
  return d.access_token as string;
}

/** Envoie une notification Firebase à un téléphone Android ; lève { statusCode: 410 } si le jeton n'existe plus. */
async function envoyerFcm(compte: CompteService, jeton: string, titre: string, corps: string, data: Record<string, string>) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${compte.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await jetonFcm(compte)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token: jeton, notification: { title: titre, body: corps }, data,
      android: { priority: 'HIGH', notification: { channel_id: 'default', sound: 'default' } },
    } }),
  });
  if (r.ok) return;
  const texteErreur = await r.text();
  if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(texteErreur)) throw { statusCode: 410 };
  throw new Error(`Firebase ${r.status}`);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!,
    { auth: { persistSession: false } },
  );
  const lireConfig = async (cle: string) =>
    (await sb.from('thaayam_config').select('valeur').eq('cle', cle).maybeSingle()).data?.valeur as string | undefined;

  // Clés VAPID des notifications web : créées une seule fois.
  let publique = await lireConfig('vapid_public');
  let privee = await lireConfig('vapid_prive');
  if (!publique || !privee) {
    const k = webpush.generateVAPIDKeys();
    // Si deux appels arrivent en même temps, la première paire enregistrée gagne : on la relit.
    await sb.from('thaayam_config').upsert([
      { cle: 'vapid_public', valeur: k.publicKey },
      { cle: 'vapid_prive', valeur: k.privateKey },
    ], { onConflict: 'cle', ignoreDuplicates: true });
    publique = await lireConfig('vapid_public');
    privee = await lireConfig('vapid_prive');
    if (!publique || !privee) return new Response('Clés indisponibles', { status: 500, headers: CORS });
  }
  // GET : le navigateur demande la clé publique pour s'abonner.
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ cle: publique }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const demande = await req.json().catch(() => ({}));

  // Appel audio / vidéo : un joueur de la partie demande les serveurs (dont le relais TURN de Cloudflare).
  if (demande.type === 'turn') {
    const reponse = (corps: unknown, statut = 200) =>
      new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const { data: place } = await sb.from('thaayam_jetons').select('place')
      .eq('code', String(demande.code ?? '')).eq('jeton', String(demande.jeton ?? '')).maybeSingle();
    if (!place) return reponse({ erreur: 'Tu ne fais pas partie de cette partie' }, 403);
    // Relais possibles (tous facultatifs, ils s'additionnent) — secrets de la fonction ou table privée thaayam_config :
    //  - ExpressTURN (gratuit 1000 Go/mois) : EXPRESSTURN_USER, EXPRESSTURN_PASS, EXPRESSTURN_HOST (défaut free.expressturn.com)
    //  - Metered (gratuit, port 443 chiffré) : METERED_USER + METERED_PASS (identifiant fixe),
    //    ou METERED_API_KEY + METERED_APP (ex. « thaayam » pour thaayam.metered.live)
    //  - Cloudflare (1000 Go/mois, demande une carte) : CF_TURN_KEY_ID, CF_TURN_API_TOKEN
    const val = async (nom: string) => Deno.env.get(nom) ?? await lireConfig(nom.toLowerCase());
    const iceServers: { urls: string[]; username?: string; credential?: string }[] = [];
    const sans53 = (x: { urls: string | string[]; username?: string; credential?: string }) =>
      ({ ...x, urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter((u) => !/:53(\?|$)/.test(u)) });
    const etat: string[] = [];

    const [euser, epass, ehote] = [await val('EXPRESSTURN_USER'), await val('EXPRESSTURN_PASS'), await val('EXPRESSTURN_HOST')];
    if (euser && epass) {
      const h = ehote || 'free.expressturn.com';
      iceServers.push({ urls: [`turn:${h}:3478?transport=udp`, `turn:${h}:3478?transport=tcp`], username: euser, credential: epass });
      etat.push('expressturn');
    }

    // Metered, identifiant fixe (tableau de bord → Credentials) : METERED_USER, METERED_PASS
    const [muser, mpass] = [await val('METERED_USER'), await val('METERED_PASS')];
    if (muser && mpass) {
      const h = 'global.relay.metered.ca';
      iceServers.push({ urls: [`turn:${h}:80`, `turn:${h}:80?transport=tcp`, `turn:${h}:443`, `turns:${h}:443?transport=tcp`],
        username: muser, credential: mpass });
      etat.push('metered');
    }

    const [mcle, mapp] = [await val('METERED_API_KEY'), await val('METERED_APP')];
    if (mcle && mapp) {
      try {
        const r = await fetch(`https://${mapp}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(mcle)}`);
        if (r.ok) { (await r.json()).forEach((x: { urls: string | string[] }) => iceServers.push(sans53(x))); etat.push('metered'); }
        else etat.push(`metered ${r.status}`);
      } catch { etat.push('metered injoignable'); }
    }

    const [id, jeton] = [await val('CF_TURN_KEY_ID'), await val('CF_TURN_API_TOKEN')];
    if (id && jeton) {
      try {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 6 * 3600 }), // valables 6 heures
        });
        if (r.ok) {
          const brut = await r.json();
          (Array.isArray(brut.iceServers) ? brut.iceServers : [brut.iceServers].filter(Boolean)).forEach((x: { urls: string | string[] }) => iceServers.push(sans53(x)));
          etat.push('cloudflare');
        } else etat.push(`cloudflare ${r.status}`);
      } catch { etat.push('cloudflare injoignable'); }
    }
    if (demande.diagnostic) return reponse({ relais: etat, nombre: iceServers.length });
    return reponse({ iceServers });
  }

  // Seule la base (qui connaît le secret partagé) peut demander un envoi.
  const secret = await lireConfig('secret_notifier');
  if (!secret || req.headers.get('x-thaayam') !== secret) return new Response('Interdit', { status: 403 });
  webpush.setVapidDetails(SITE, publique, privee);

  const { type, joueur, code, de } = demande;
  if ((type !== 'tour' && type !== 'invitation') || !joueur || !code) return new Response('Demande invalide', { status: 400 });
  let nomDe = '';
  if (type === 'invitation' && de) {
    nomDe = (await sb.from('thaayam_joueurs').select('pseudo').eq('id', de).maybeSingle()).data?.pseudo ?? '';
  }

  const { data: abonnements } = await sb.from('thaayam_notifs').select('*').eq('joueur', joueur);
  const url = `${SITE}/?code=${code}`;
  let envoyes = 0;
  let compteFcm: CompteService | null | undefined;
  for (const a of abonnements ?? []) {
    const corps = texte(a.langue, type, { code, de: nomDe });
    try {
      if (a.type === 'web') {
        await webpush.sendNotification(a.abonnement, JSON.stringify({ titre: 'Thaayam', corps, url, type, code }), { TTL: 3600 });
      } else if (a.type === 'fcm') {
        if (compteFcm === undefined) {
          const brut = Deno.env.get('FCM_COMPTE_SERVICE') ?? await lireConfig('fcm_compte_service');
          try { compteFcm = brut ? JSON.parse(brut) : null; } catch { compteFcm = null; }
        }
        if (!compteFcm) continue; // Firebase pas encore réglé
        await envoyerFcm(compteFcm, String(a.abonnement), 'Thaayam', corps, { type, code });
      } else {
        const r = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ to: a.abonnement, title: 'Thaayam', body: corps, sound: 'default', data: { type, code } }),
        });
        const res = await r.json();
        if (res?.data?.details?.error === 'DeviceNotRegistered') throw { statusCode: 410 };
      }
      envoyes++;
    } catch (e) {
      // Abonnement expiré (appli désinstallée, notifications refusées) : on l'oublie.
      const statut = (e as { statusCode?: number })?.statusCode;
      if (statut === 404 || statut === 410) {
        await sb.from('thaayam_notifs').delete().eq('joueur', a.joueur).eq('appareil', a.appareil);
      }
    }
  }
  return new Response(JSON.stringify({ envoyes }), { headers: { 'Content-Type': 'application/json' } });
});
