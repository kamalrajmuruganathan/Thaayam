// Le moteur du jeu (dossier moteur/) est partagé avec la page web :
// il vit un cran au-dessus de app/, Metro doit donc le surveiller.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..', 'moteur')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
