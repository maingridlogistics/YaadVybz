// shims/metro-isResolvedDependency.js
// Stub for metro/src/lib/isResolvedDependency.js which is missing from the
// nested @expo+metro@54.2.0 pnpm package. The hoisted metro copy also lacks
// this file (it was added in a later metro patch release).
//
// This shim reproduces the module's contract based on Metro's public source:
// https://github.com/facebook/metro/blob/main/packages/metro/src/lib/isResolvedDependency.js
//
// isResolvedDependency(dep) returns true when the dependency object has an
// absolutePath set — i.e. it has already been resolved by Metro's resolver.

'use strict';

/**
 * @param {{ absolutePath?: string | null }} dep
 * @returns {boolean}
 */
function isResolvedDependency(dep) {
  return dep != null && dep.absolutePath != null;
}

module.exports = isResolvedDependency;
