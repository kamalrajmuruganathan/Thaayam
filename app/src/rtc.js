// Appels sur la version web de l'appli : WebRTC du navigateur.
export const RTCPeerConnection = typeof window !== 'undefined' ? window.RTCPeerConnection : undefined;
export const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
export const RTCView = null; // la vidéo est affichée avec une balise <video> (voir Appel.js)
