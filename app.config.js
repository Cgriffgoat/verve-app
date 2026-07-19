// Reads .env values and injects them into Constants.expoConfig.extra at build time.
// Access them in code via: import Constants from 'expo-constants'; Constants.expoConfig.extra.supabaseUrl
const config = require('./app.json');

module.exports = {
  ...config.expo,
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googlePlacesApiKey: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
    tmdbApiKey: process.env.EXPO_PUBLIC_TMDB_API_KEY,
    eas: {
      projectId: '0e267d5c-6316-4d0b-85c9-4de31d851e97',
    },
  },
};
