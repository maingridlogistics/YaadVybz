// Metro configuration for Vybz Hub
// Expo SDK 54 / React Native 0.81.x
//
// Uses the import recommended by Expo SDK 54 documentation:
//   const { getDefaultConfig } = require('expo/metro-config');
//
// The previous global Module._resolveFilename patch (added to work around a
// missing metro/src/lib/isResolvedDependency.js in the nested @expo+metro pnpm
// package) has been removed. expo/metro-config is the documented entry point
// and avoids triggering the broken nested-package resolution chain that
// @expo/metro-config's internal require calls produced.

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
