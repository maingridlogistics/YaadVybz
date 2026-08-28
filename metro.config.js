// Metro configuration for Vybz Hub
// Expo SDK 54 / React Native 0.81.x
//
// Uses Expo's default Metro config. The hermesParser override previously
// used for Expo SDK 53 / RN 0.79 is not compatible with the internal Metro
// module layout in Expo SDK 54 and caused a missing-module crash on startup.
// Expo SDK 54's bundled hermes-parser handles Flow syntax correctly by default.

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
