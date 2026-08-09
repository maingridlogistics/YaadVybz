/**
 * expo-metro-transformer-shim.js
 *
 * Thin wrapper around @expo/metro-config's babel-transformer that patches
 * hermes-parser to always parse files as Flow ('all' mode) rather than
 * only when an @flow pragma is present ('detect' mode, the default).
 *
 * react-native@0.79.x contains .js files that use Flow type syntax
 * (e.g. `type Props = $ReadOnly<{...ViewProps, ...}>`) without a @flow
 * pragma.  hermes-parser@0.25.1 defaults to `flow: 'detect'`, so those
 * files are parsed as plain JavaScript and fail on the spread type.
 *
 * This shim runs inside the Metro transform worker process, so the patch
 * is applied before any file is transformed.  Everything else is delegated
 * to the real Expo transformer unchanged.
 */

// Patch hermes-parser in this worker process before the real transformer
// requires and uses it.  Node's module cache ensures any later require()
// of hermes-parser receives the same (patched) module object.
try {
  const hermesParser = require('hermes-parser');
  if (hermesParser && typeof hermesParser.parse === 'function') {
    const _originalParse = hermesParser.parse.bind(hermesParser);
    hermesParser.parse = function patchedParse(code, opts) {
      // 'all' = always parse as Flow regardless of @flow pragma
      return _originalParse(code, { flow: 'all', ...opts });
    };
  }
} catch (_e) {
  // hermes-parser may not be present in all environments; ignore silently.
}

// Delegate every transform call to the real @expo/metro-config transformer.
// This preserves the full Expo hermesc chain for EAS / production builds.
module.exports = require('@expo/metro-config/build/babel-transformer');
