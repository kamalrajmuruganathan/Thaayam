// Fonction Edge Supabase « thaayam-notifier » : envoie les notifications du jeu.
// - « C'est ton tour » et « X t'invite », demandées par la base (déclencheurs de supabase/thaayam.sql).
// - Navigateurs : notifications web (Web Push, clés VAPID créées ici au premier appel et rangées
//   dans la table privée thaayam_config).
// - Appli Android / iPhone : service de notifications d'Expo.
// - Appels audio / vidéo : identifiants du serveur relais TURN de Cloudflare, donnés seulement aux joueurs
//   d'une partie (secrets CF_TURN_KEY_ID et CF_TURN_API_TOKEN, ou lignes cf_turn_key_id / cf_turn_api_token de thaayam_config).
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
    // Valeurs du relais : secrets de la fonction, ou sinon table privée thaayam_config (cf_turn_key_id, cf_turn_api_token)
    const id = Deno.env.get('CF_TURN_KEY_ID') ?? await lireConfig('cf_turn_key_id');
    const jeton = Deno.env.get('CF_TURN_API_TOKEN') ?? await lireConfig('cf_turn_api_token');
    if (!id || !jeton) return reponse({ iceServers: [] }); // relais pas encore installé : connexion directe seulement
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 3600 }), // valables 6 heures
    });
    if (!r.ok) return reponse({ iceServers: [], erreur: `TURN ${r.status}` });
    const brut = await r.json();
    const liste = Array.isArray(brut.iceServers) ? brut.iceServers : [brut.iceServers].filter(Boolean);
    // Les navigateurs bloquent le port 53 : on le retire
    const iceServers = liste.map((x: { urls: string | string[]; username?: string; credential?: string }) => ({
      ...x, urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter((u) => !/:53(\?|$)/.test(u)),
    })).filter((x: { urls: string[] }) => x.urls.length);
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
  for (const a of abonnements ?? []) {
    const corps = texte(a.langue, type, { code, de: nomDe });
    try {
      if (a.type === 'web') {
        await webpush.sendNotification(a.abonnement, JSON.stringify({ titre: 'Thaayam', corps, url, type, code }), { TTL: 3600 });
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
