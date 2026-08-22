// https://docs.expo.dev/guides/using-eslint/

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Generated/native folders and Deno Edge Functions are excluded.
    ignores: [
      'dist/*',
      '.expo/**',
      'ios/**',
      'android/**',
      'supabase/functions/**',
    ],
  },
]);