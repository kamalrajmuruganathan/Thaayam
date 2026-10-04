/**
 * Jeu en ligne via Supabase (partagé entre la page web et l'appli Expo).
 * `client` est un client créé avec createClient(url, clePublique).
 * `stockage` : { lire(cle) → Promise<string|null>, ecrire(cle, valeur) → Promise }.
 */
import { nouvellePartie } from './partie.js';

const CLE = (code) => `thaayam:${code}`;

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
  return {
    /** Crée la partie et mémorise le jeton sur l'appareil. */
    async creer(regles, nom) {
      const r = await rpc(client, 'thaayam_creer', { p_regles: regles, p_nom: nom });
      await stockage.ecrire(CLE(r.code), JSON.stringify({ place: r.place, jeton: r.jeton }));
      return r;
    },

    async rejoindre(code, nom) {
      const c = code.trim().toUpperCase();
      const deja = await this.maPlace(c);
      if (deja) return { code: c, ...deja };
      const r = await rpc(client, 'thaayam_rejoindre', { p_code: c, p_nom: nom });
      await stockage.ecrire(CLE(r.code), JSON.stringify({ place: r.place, jeton: r.jeton }));
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
