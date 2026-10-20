/**
 * Jeu en ligne via Supabase (partagé entre la page web et l'appli Expo).
 * `client` est un client créé avec createClient(url, clePublique).
 * `stockage` : { lire(cle) → Promise<string|null>, ecrire(cle, valeur) → Promise }.
 */
import { nouvellePartie } from './partie.js';

const CLE = (code) => `thaayam:${code}`;

/** Messages rapides autorisés (la même liste est vérifiée par Supabase). */
export const REACTIONS = ['👏', '😂', '😮', '😡', '🔥', '🙏',
  'Bien joué !', 'Pas de chance !', 'Vite !', 'Bravo !', 'Oh non !', 'Merci !'];
const PROFIL = 'thaayam:profil'; // { id, secret, code_ami } : profil de cet appareil (amis, classement)
const LISTE = 'thaayam:mes-parties'; // [{ code, quand }] : parties de cet appareil, la plus récente d'abord

async function lireListe(stockage) {
  try { return JSON.parse((await stockage.lire(LISTE)) || '[]'); } catch { return []; }
}

async function retenir(stockage, code) {
  const liste = (await lireListe(stockage)).filter((p) => p.code !== code);
  await stockage.ecrire(LISTE, JSON.stringify([{ code, quand: Date.now() }, ...liste].slice(0, 10)));
}

function erreurLisible(error) {
  const m = (error && error.message) || String(error);
  if (/Failed to fetch|NetworkError|Network request failed/i.test(m)) return 'Pas de connexion internet.';
  if (/function .* does not exist|Could not find the function/i.test(m))
    return "Le jeu en ligne n'est pas encore installé sur Supabase (fichier supabase/thaayam.sql).";
  return m;
}

async function rpc(client, nom, params) {
  const { data, error } = await client.rpc(nom, params);
  if (error) throw new Error(erreurLisible(error));
  return data;
}

export function creerEnLigne(client, stockage) {
  const lireProfil = async () => {
    try { return JSON.parse((await stockage.lire(PROFIL)) || 'null'); } catch { return null; }
  };
  return {
    /** Profil de cet appareil, s'il existe déjà : { id, secret, code_ami } ou null. */
    profilLocal: lireProfil,

    /** Crée le profil (ou met à jour le pseudo) et le mémorise. */
    async profil(pseudo) {
      const p = await lireProfil();
      const r = await rpc(client, 'thaayam_profil', { p_joueur: p ? p.id : null, p_secret: p ? p.secret : null, p_pseudo: pseudo });
      await stockage.ecrire(PROFIL, JSON.stringify(r));
      return r;
    },

    /** Amis, invitations reçues et classement : { profil, amis, invitations, classement }. */
    async social(pseudo) {
      let p = await lireProfil();
      if (!p) p = await this.profil(pseudo);
      let r;
      try {
        r = await rpc(client, 'thaayam_social', { p_joueur: p.id, p_secret: p.secret });
      } catch (e) {
        if (!/Profil inconnu/.test(e.message)) throw e;
        await stockage.ecrire(PROFIL, 'null');
        p = await this.profil(pseudo);
        r = await rpc(client, 'thaayam_social', { p_joueur: p.id, p_secret: p.secret });
      }
      return { profil: p, ...r };
    },

    async ajouterAmi(codeAmi) {
      const p = await lireProfil();
      if (!p) throw new Error('Profil inconnu');
      return rpc(client, 'thaayam_ajouter_ami', { p_joueur: p.id, p_secret: p.secret, p_code_ami: codeAmi.trim().toUpperCase() });
    },

    async retirerAmi(id) {
      const p = await lireProfil();
      if (!p) throw new Error('Profil inconnu');
      await rpc(client, 'thaayam_retirer_ami', { p_joueur: p.id, p_secret: p.secret, p_ami: id });
    },

    /** Invite un ami dans la partie `code` (en attente). */
    async inviter(id, code) {
      const p = await lireProfil();
      if (!p) throw new Error('Profil inconnu');
      await rpc(client, 'thaayam_inviter', { p_joueur: p.id, p_secret: p.secret, p_ami: id, p_code: code });
    },

    /** Relie ma place dans la partie à mon profil (classement, notifications). Sans effet si pas de profil. */
    async lier(code, jeton) {
      const p = await lireProfil();
      if (!p) return;
      try {
        await rpc(client, 'thaayam_lier', { p_code: code, p_jeton: jeton, p_joueur: p.id, p_secret: p.secret });
      } catch { /* serveur pas encore mis à jour : le jeu continue sans classement */ }
    },

    /** Abonne cet appareil aux notifications (abonnement null = désabonner). type : 'web' ou 'expo'. */
    async abonner(appareil, type, abonnement, langue) {
      const p = await lireProfil();
      if (!p) throw new Error('Profil inconnu');
      await rpc(client, 'thaayam_abonner', { p_joueur: p.id, p_secret: p.secret, p_appareil: appareil, p_type: type,
        p_abonnement: abonnement, p_langue: langue });
    },

    /** Clé publique des notifications web, ou null si la fonction Edge « thaayam-notifier » n'est pas installée. */
    async cleNotifs() {
      const cle = await rpc(client, 'thaayam_cle_notifs', {});
      if (cle) return cle;
      try {
        // Premier abonnement : la fonction Edge crée les clés et renvoie la clé publique.
        const { data } = await client.functions.invoke('thaayam-notifier', { method: 'GET' });
        return (data && data.cle) || null;
      } catch {
        return null;
      }
    },

    /** Crée le profil si besoin, puis relie la place. Ne fait jamais échouer la partie. */
    async lierAvecProfil(code, jeton, nom) {
      try {
        if (!(await lireProfil()) && nom) await this.profil(nom);
        await this.lier(code, jeton);
      } catch { /* ignoré */ }
    },

    /** Crée la partie et mémorise le jeton sur l'appareil. */
    async creer(regles, nom) {
      const r = await rpc(client, 'thaayam_creer', { p_regles: regles, p_nom: nom });
      await stockage.ecrire(CLE(r.code), JSON.stringify({ place: r.place, jeton: r.jeton }));
      await retenir(stockage, r.code);
      await this.lierAvecProfil(r.code, r.jeton, nom);
      return r;
    },

    async rejoindre(code, nom) {
      const c = code.trim().toUpperCase();
      const deja = await this.maPlace(c);
      if (deja) return { code: c, ...deja };
      const r = await rpc(client, 'thaayam_rejoindre', { p_code: c, p_nom: nom });
      await stockage.ecrire(CLE(r.code), JSON.stringify({ place: r.place, jeton: r.jeton }));
      await retenir(stockage, r.code);
      await this.lierAvecProfil(r.code, r.jeton, nom);
      return r;
    },

    /** { place, jeton } si cet appareil participe déjà à la partie. */
    async maPlace(code) {
      try {
        const v = await stockage.lire(CLE(code));
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },

    /**
     * Parties en ligne de cet appareil encore en attente ou en cours :
     * [{ code, place, jeton, statut, joueurs, aMoi }] (aMoi : c'est à moi de jouer).
     * Les parties terminées ou effacées sont oubliées.
     */
    async mesParties() {
      const liste = await lireListe(stockage);
      if (!liste.length) return [];
      const codes = liste.map((p) => p.code);
      const { data, error } = await client.from('thaayam_parties').select('code, statut, joueurs, etat').in('code', codes);
      if (error) throw new Error(erreurLisible(error));
      const res = [];
      for (const { code } of liste) {
        const p = (data || []).find((x) => x.code === code);
        const moi = await this.maPlace(code);
        if (!p || p.statut === 'finie' || !moi) continue;
        res.push({ code, place: moi.place, jeton: moi.jeton, statut: p.statut, joueurs: p.joueurs,
          aMoi: p.statut === 'en_cours' && p.etat && p.etat.tour === moi.place });
      }
      const gardes = liste.filter((x) => res.some((r) => r.code === x.code));
      if (gardes.length !== liste.length) await stockage.ecrire(LISTE, JSON.stringify(gardes));
      return res;
    },

    async lire(code) {
      const { data, error } = await client.from('thaayam_parties').select('*').eq('code', code).maybeSingle();
      if (error) throw new Error(erreurLisible(error));
      if (!data) throw new Error('Partie introuvable.');
      return data;
    },

    /** Le créateur lance la partie avec les joueurs inscrits. */
    async demarrer(partie, jeton) {
      const etat = nouvellePartie(partie.regles, partie.joueurs);
      await rpc(client, 'thaayam_demarrer', { p_code: partie.code, p_jeton: jeton, p_etat: etat });
    },

    /**
     * Revanche d'une partie terminée : même joueurs, mêmes places, mêmes règles.
     * Renvoie le code de la nouvelle partie (la même pour tous les joueurs).
     */
    async revanche(code, jeton) {
      const moi = await this.maPlace(code);
      const nouveau = await rpc(client, 'thaayam_revanche', { p_code: code, p_jeton: jeton });
      if (moi) await stockage.ecrire(CLE(nouveau), JSON.stringify(moi));
      await retenir(stockage, nouveau);
      return nouveau;
    },

    /** Envoie un message rapide (un de REACTIONS) aux autres joueurs. */
    async reagir(code, jeton, texte) {
      await rpc(client, 'thaayam_reagir', { p_code: code, p_jeton: jeton, p_texte: texte });
    },

    /** Envoie le nouvel état ; échoue si quelqu'un a joué entre-temps. */
    async envoyer(code, jeton, version, etat) {
      return rpc(client, 'thaayam_jouer', { p_code: code, p_jeton: jeton, p_version: version, p_etat: etat });
    },

    /** Appelle surChangement(partie) à chaque modification. Renvoie une fonction d'arrêt. */
    suivre(code, surChangement) {
      const canal = client
        .channel(`thaayam-${code}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'thaayam_parties', filter: `code=eq.${code}` },
          (p) => surChangement(p.new)
        )
        .subscribe();
      // Filet de sécurité si le temps réel décroche (réseau mobile).
      const minuteur = setInterval(() => {
        this.lire(code).then(surChangement).catch(() => {});
      }, 8000);
      return () => {
        clearInterval(minuteur);
        client.removeChannel(canal);
      };
    },
  };
}
