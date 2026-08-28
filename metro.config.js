// Metro configuration for Vybz Hub
// Expo SDK 54 / React Native 0.81.x
//
// Uses the import recommended by Expo SDK 54 documentation:
//   const { getDefaultConfig } = require('expo/metro-config');
//
// PNPM SHIM PATCH
// ──────────────────────────────────────────────────────────────────────────────
// pnpm workspaces place @expo+metro@54.2.0 in a nested node_modules tree:
//   node_modules/.pnpm/@expo+metro@54.2.0/node_modules/metro/
//
// That nested metro copy has a package.json `exports` map that declares paths
// which do not physically exist in this version (e.g. src/lib/isResolvedDependency.js).
// When any module in the chain does `require('metro/src/lib/isResolvedDependency')`
// Node.js resolves the bare specifier through the nested metro's exports map,
// calls resolveExports → finalizeEsmResolution → createEsmNotFoundErr and crashes
// BEFORE any filesystem fallback can occur.
//
// The patch intercepts Module._resolveFilename with substring matching so it
// fires regardless of whether the request includes the .js extension or not,
// and returns a local shim BEFORE Node.js consults the exports map.
// This is only applied to the specific known-missing metro internal paths.
//
// expo/metro-config (documented Expo SDK 54 entry point) is used — NOT
// @expo/metro-config. The patch is necessary even with the correct import
// because expo/metro-config internally loads @expo+metro which has the broken
// exports map.

const Module = require('module');
const path = require('path');

// Map of substring patterns → local shim file paths.
// Substring matching is intentional: avoids exact-string failure when Node.js
// appends/omits the .js extension depending on the require() call site.
const SHIMS = [
  {
    contains: 'isResolvedDependency',
    shim: path.resolve(__dirname, 'shims', 'metro-isResolvedDependency.js'),
  },
];

const _originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function vybzMetroShim(request, parent, isMain, options) {
  if (typeof request === 'string') {
    for (const entry of SHIMS) {
      if (request.includes(entry.contains)) {
        // Return the shim path directly — bypasses exports map lookup entirely.
        return entry.shim;
      }
    }
  }
  return _originalResolveFilename.call(this, request, parent, isMain, options);
};

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
