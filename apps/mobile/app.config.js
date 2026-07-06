const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');
const googleServicesPath = path.join(__dirname, 'google-services.json');

/** Carrega apps/mobile/.env antes do config plugin do Maps (Expo nem sempre exporta todas as vars). */
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

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

function withMapsApiKey(config) {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!mapsKey) return config;

  const plugins = (config.expo.plugins ?? []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') {
      return [
        'react-native-maps',
        {
          ...(plugin[1] ?? {}),
          androidGoogleMapsApiKey: mapsKey,
        },
      ];
    }
    return plugin;
  });

  return {
    ...config,
    expo: {
      ...config.expo,
      plugins,
    },
  };
}

/** @type {import('@expo/config').ExpoConfig} */
module.exports = () => withMapsApiKey(appJson);
