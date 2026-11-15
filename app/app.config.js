// Configuration de l'appli : app.json + fichier Firebase (notifications Android) s'il est présent.
// google-services.json se télécharge dans la console Firebase (projet → appli Android com.kamal.thaayam).
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const firebase = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(firebase)) config.android = { ...config.android, googleServicesFile: './google-services.json' };
  return config;
};
