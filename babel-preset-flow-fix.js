/**
 * babel-preset-flow-fix
 *
 * This preset exists solely to host babel-plugin-ts-cleanup at the correct
 * position in Babel's execution order.
 *
 * Key ordering rule: Babel runs presets in REVERSE order.
 * In babel.config.js:  presets: ['./babel-preset-flow-fix', 'babel-preset-expo']
 *   → babel-preset-expo  runs FIRST  (index 1, reversed = first)
 *   → this preset        runs SECOND (index 0, reversed = last)
 *
 * Because this preset runs last, its plugin's manipulateOptions hook fires
 * AFTER babel-preset-expo has added the `typescript` parser plugin.  That
 * allows babel-plugin-ts-cleanup to remove `typescript` from parserOpts for
 * react-native .js files, leaving only `flow` (which was added earlier by
 * @babel/plugin-transform-flow-strip-types in the overrides block).
 */
module.exports = function babelPresetFlowFix() {
  return {
    plugins: [require('./babel-plugin-ts-cleanup')],
  }
}
