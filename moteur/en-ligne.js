/**
 * Jeu en ligne via Supabase (partagé entre la page web et l'appli Expo).
 * `client` est un client créé avec createClient(url, clePublique).
 * `stockage` : { lire(cle) → Promise<string|null>, ecrire(cle, valeur) → Promise }.
 */
import { nouvellePartie } from './partie.js';

const CLE = (code) => `thaayam:${code}`;
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
  return {
    /** Crée la partie et mémorise le jeton sur l'appareil. */
    async creer(regles, nom) {
      const r = await rpc(client, 'thaayam_creer', { p_regles: regles, p_nom: nom });
      await stockage.ecrire(CLE(r.code), JSON.stringify({ place: r.place, jeton: r.jeton }));
      await retenir(stockage, r.code);
      return r;
    },

    async rejoindre(code, nom) {
      const c = code.trim().toUpperCase();
      const deja = await this.maPlace(c);
      if (deja) return { code: c, ...deja };
      const r = await rpc(client, 'thaayam_rejoindre', { p_code: c, p_nom: nom });
      await stockage.ecrire(CLE(r.code), JSON.stringify({ place: r.place, jeton: r.jeton }));
      await retenir(stockage, r.code);
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
