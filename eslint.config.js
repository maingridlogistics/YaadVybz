// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions runs in the Deno runtime (not Node/Expo).
    // It uses https:// URL imports, Deno globals, and .ts extension imports
    // that are incompatible with the Expo/Node ESLint environment.
    // Validate Edge Functions separately using Deno's own tooling:
    //   deno lint supabase/functions
    //   deno check supabase/functions
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
