// Metro configuration for Vybz Hub
// Expo SDK 53 / React Native 0.79.4
//
// react-native@0.79.4 ships .js files that still contain Flow type syntax
// (e.g. ActivityIndicator.js, setUpTimers.js) but WITHOUT a @flow pragma.
// hermes-parser@0.25.1 (bundled with @expo/metro-config@0.20.15) defaults
// to `flow: 'detect'` mode, so it parses those files as plain JavaScript
// and fails on Flow spreads like `{...ViewProps, ...}`.
//
// Fix: shims/expo-metro-transformer-shim.js is a thin wrapper that patches
// hermes-parser to use `flow: 'all'` (always parse as Flow), then delegates
// to @expo/metro-config's real transformer unchanged.  The full Expo hermesc
// chain is preserved for EAS / production builds.
//
// No custom resolver or plugin is added — only babelTransformerPath is
// redirected, which is the documented Metro escape hatch for parser issues.

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('./shims/expo-metro-transformer-shim'),
};

module.exports = config;
