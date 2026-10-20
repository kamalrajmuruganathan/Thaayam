/**
 * Appels audio et vidéo entre les joueurs d'une partie (WebRTC, navigateur).
 * Chaque joueur se connecte directement à chacun des autres (2 à 4 joueurs).
 * La mise en relation passe par un canal Supabase (`canalAppel` de moteur/en-ligne.js) :
 *   appel    : quelqu'un lance un appel (les autres voient « X t'appelle »)
 *   rejoint  : j'entre dans l'appel ; present : je suis déjà dans l'appel
 *   offre / reponse / ice : mise en relation de deux joueurs ; quitte : je raccroche
 * Le micro et la caméra ne s'allument qu'après l'accord du joueur (et du navigateur).
 */
const SERVEURS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export const appelsPossibles = () => !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/**
 * canal : { envoyer(message), arreter() } ; place : ma place ; nom : mon nom.
 * surChange() : l'état a changé (redessiner) ; surSonnerie(s) : appel entrant { de, nom, video } ou null.
 */
export function creerAppel({ canal, place, nom, surChange, surSonnerie }) {
  const a = {
    actif: false, video: false, local: null, micro: true, camera: true,
    pairs: new Map(), // place → { pc, flux, enAttente: [] }
    noms: new Map(), // place → nom
  };
  let minuteurSonnerie = null;
  let sonnerie = null; // appel entrant affiché
  const envoyer = (m) => { try { canal.envoyer({ ...m, de: place, nom }); } catch { /* hors ligne */ } };

  function fermerPair(x) {
    const p = a.pairs.get(x);
    if (!p) return;
    try { p.pc.close(); } catch { /* déjà fermé */ }
    a.pairs.delete(x);
    surChange();
  }

  function creerPair(x) {
    fermerPair(x);
    const pc = new RTCPeerConnection({ iceServers: SERVEURS });
    const p = { pc, flux: null, enAttente: [] };
    a.pairs.set(x, p);
    a.local.getTracks().forEach((piste) => pc.addTrack(piste, a.local));
    pc.onicecandidate = (e) => { if (e.candidate) envoyer({ type: 'ice', a: x, candidat: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { p.flux = e.streams[0]; surChange(); };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) fermerPair(x);
      else surChange();
    };
    return p;
  }

  async function viderCandidats(p) {
    for (const c of p.enAttente.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
  }

  async function offrir(x) {
    const p = creerPair(x);
    await p.pc.setLocalDescription(await p.pc.createOffer());
    envoyer({ type: 'offre', a: x, sdp: p.pc.localDescription.toJSON() });
  }

  async function recevoir(m) {
    if (m.de === place || (m.a !== undefined && m.a !== place)) return;
    if (m.nom) a.noms.set(m.de, m.nom);
    try {
      if (m.type === 'appel' || (m.type === 'rejoint' && !a.actif)) {
        if (a.actif) return;
        // « X t'appelle » reste affiché quand X entre aussitôt dans son propre appel
        if (m.type === 'rejoint' && sonnerie && sonnerie.de === m.de) return;
        sonnerie = { de: m.de, nom: m.nom, video: !!m.video, enCours: m.type === 'rejoint' };
        surSonnerie(sonnerie);
        clearTimeout(minuteurSonnerie);
        minuteurSonnerie = setTimeout(() => { sonnerie = null; surSonnerie(null); }, 45000);
        return;
      }
      // L'appelant raccroche avant qu'on réponde : la sonnerie s'arrête
      if (m.type === 'quitte' && sonnerie && sonnerie.de === m.de) { sonnerie = null; surSonnerie(null); }
      if (!a.actif) return;
      if (m.type === 'rejoint') {
        // Le joueur qui a la plus petite place fait l'offre (évite deux offres croisées)
        if (place < m.de) await offrir(m.de);
        else envoyer({ type: 'present', a: m.de });
      } else if (m.type === 'present') {
        if (place < m.de) await offrir(m.de);
      } else if (m.type === 'offre') {
        const p = creerPair(m.de);
        await p.pc.setRemoteDescription(m.sdp);
        await viderCandidats(p);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        envoyer({ type: 'reponse', a: m.de, sdp: p.pc.localDescription.toJSON() });
      } else if (m.type === 'reponse') {
        const p = a.pairs.get(m.de);
        if (p) { await p.pc.setRemoteDescription(m.sdp); await viderCandidats(p); }
      } else if (m.type === 'ice') {
        const p = a.pairs.get(m.de);
        if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.candidat).catch(() => {});
        else p.enAttente.push(m.candidat);
      } else if (m.type === 'quitte') {
        fermerPair(m.de);
      }
    } catch { /* message abîmé ou connexion perdue : on ignore */ }
  }

  async function allumer(video) {
    a.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    a.actif = true;
    a.video = video;
    a.micro = true;
    a.camera = video;
    sonnerie = null;
    surSonnerie(null);
    surChange();
  }

  return {
    etat: a,
    recevoir,
    /** Lancer un appel (après l'accord du joueur). */
    async demarrer(video) {
      await allumer(video);
      envoyer({ type: 'appel', video });
      envoyer({ type: 'rejoint', video });
    },
    /** Répondre à un appel (après l'accord du joueur). */
    async accepter(video) {
      await allumer(video);
      envoyer({ type: 'rejoint', video });
    },
    refuser() { clearTimeout(minuteurSonnerie); sonnerie = null; surSonnerie(null); },
    raccrocher() {
      if (!a.actif) return;
      envoyer({ type: 'quitte' });
      [...a.pairs.keys()].forEach(fermerPair);
      if (a.local) a.local.getTracks().forEach((p) => p.stop());
      a.local = null;
      a.actif = false;
      surChange();
    },
    basculerMicro() {
      a.micro = !a.micro;
      if (a.local) a.local.getAudioTracks().forEach((p) => { p.enabled = a.micro; });
      surChange();
    },
    basculerCamera() {
      a.camera = !a.camera;
      if (a.local) a.local.getVideoTracks().forEach((p) => { p.enabled = a.camera; });
      surChange();
    },
  };
}
