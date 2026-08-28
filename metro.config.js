// Metro configuration for Vybz Hub
// Expo SDK 54 / React Native 0.81.x
//
// pnpm layout fix: In pnpm workspaces, Metro resolves packages through
// symlinks into .pnpm/. Some Metro internals (e.g. isResolvedDependency.js)
// are only present in the root-hoisted copy of `metro`, not in the copy
// nested inside @expo+metro. nodeModulesPaths tells Metro's resolver to
// always check the project root node_modules first so it finds the correct
// hoisted copy.

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure Metro resolves modules from the project root so pnpm-hoisted
// packages (including metro internals) are found before nested copies.
config.resolver = config.resolver ?? {};
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
