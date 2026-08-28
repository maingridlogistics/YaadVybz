// Metro configuration for Vybz Hub
// Expo SDK 54 / React Native 0.81.x
//
// Uses the bare @expo/metro-config package directly to avoid the
// expo/metro-config re-export chain which (in pnpm workspaces) triggers
// evaluation of @expo/config-plugins and pulls in a nested metro copy
// that is missing src/lib/isResolvedDependency.js at startup.

const { getDefaultConfig } = require('@expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
