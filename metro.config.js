// Metro configuration for Vybz Hub
// Expo SDK 53 / React Native 0.79.4
//
// This file is required to work around a hermes-parser@0.25.1 incompatibility
// with certain internal React Native 0.79.x files (e.g. setUpTimers.js).
// Setting hermesParser: false makes the Expo Babel transformer fall back to
// @babel/parser for all JS files, which handles the syntax correctly.
// No custom transformer, resolver, or plugin is added — only the built-in
// Expo transformer is configured.

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Disable hermes-parser to fix parse failures on react-native@0.79.4 internals
config.transformer = {
  ...config.transformer,
  hermesParser: false,
};

module.exports = config;
