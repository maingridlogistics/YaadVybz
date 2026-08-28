// Metro configuration for Vybz Hub
// Expo SDK 54 / React Native 0.81.x
//
// pnpm workspaces place @expo+metro@54.x in a nested node_modules directory.
// That nested copy ships metro source files but is MISSING some files added in
// later metro patch releases (e.g. isResolvedDependency.js). Node.js resolves
// `metro/src/lib/isResolvedDependency` to this incomplete nested copy and
// crashes at startup before Metro can even start.
//
// FIX: Patch Module._resolveFilename BEFORE any @expo package is loaded.
// Requests for any `metro/*` sub-path that cannot be found in the nested tree
// are redirected first to the hoisted root-level metro package, and if still
// missing, to a local shim in shims/.
// This is a targeted startup patch — Metro's own internal bundler resolver
// (which runs in a worker, after startup) is unaffected.

const Module = require('module');
const path = require('path');
const fs = require('fs');

// Shim directory for metro internals missing from both nested and hoisted copies.
const shimsDir = path.resolve(__dirname, 'shims');

// Map of metro sub-paths that may be missing → local shim file.
// Add entries here if additional metro internals go missing in future upgrades.
const METRO_SHIMS = {
  'src/lib/isResolvedDependency.js': path.join(shimsDir, 'metro-isResolvedDependency.js'),
  'src/lib/isResolvedDependency':    path.join(shimsDir, 'metro-isResolvedDependency.js'),
};

// Path to the hoisted metro package at the project root.
const hoistedMetroDir = path.resolve(__dirname, 'node_modules', 'metro');
const hoistedMetroExists = fs.existsSync(path.join(hoistedMetroDir, 'package.json'));

const original = Module._resolveFilename;

Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  // Only intercept `metro/…` sub-path imports that are resolving FROM within
  // the nested @expo+metro pnpm tree — not all metro requires everywhere.
  if (
    typeof request === 'string' &&
    request.startsWith('metro/') &&
    typeof parent?.filename === 'string' &&
    parent.filename.includes('@expo+metro')
  ) {
    const subpath = request.slice('metro/'.length); // e.g. "src/lib/isResolvedDependency.js"

    // 1. Try hoisted root-level metro first.
    if (hoistedMetroExists) {
      const candidate = path.join(hoistedMetroDir, subpath);
      if (fs.existsSync(candidate)) return candidate;
    }

    // 2. Fall back to a local shim if we have one for this sub-path.
    const shim = METRO_SHIMS[subpath];
    if (shim && fs.existsSync(shim)) return shim;
  }
  return original.call(this, request, parent, isMain, options);
};

const { getDefaultConfig } = require('@expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
