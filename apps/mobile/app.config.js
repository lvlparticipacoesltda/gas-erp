const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');
const googleServicesPath = path.join(__dirname, 'google-services.json');

function ensureGoogleServicesFile() {
  if (fs.existsSync(googleServicesPath)) return;

  const base64 = process.env.GOOGLE_SERVICES_JSON_BASE64;
  if (base64) {
    fs.writeFileSync(
      googleServicesPath,
      Buffer.from(base64, 'base64').toString('utf8'),
    );
    return;
  }

  const raw = process.env.GOOGLE_SERVICES_JSON;
  if (raw) {
    fs.writeFileSync(googleServicesPath, raw);
  }
}

ensureGoogleServicesFile();

/** @type {import('@expo/config').ExpoConfig} */
module.exports = () => appJson;
