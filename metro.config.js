// Metro configuration for Vybz Hub
// Expo SDK 53 / React Native 0.79.4
//
// react-native@0.79.x ships .js files that still contain Flow type syntax
// (e.g. setUpTimers.js, ActivityIndicator.js) but WITHOUT a @flow pragma.
// hermes-parser@0.25.1 (bundled with @expo/metro-config@0.20.15) defaults
// to `flow: 'detect'` mode, so it parses those files as plain JavaScript
// and fails on Flow-specific constructs.
//
// Fix: setting hermesParser: false in the transformer config instructs
// @expo/metro-config's Babel transformer to fall back to @babel/parser,
// which handles Flow syntax correctly via babel-preset-expo.

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  hermesParser: false,
};

module.exports = config;
