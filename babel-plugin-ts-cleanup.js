/**
 * babel-plugin-ts-cleanup
 *
 * Removes the `typescript` parser plugin from parserOpts for react-native .js
 * files that contain Flow type annotations.
 *
 * This plugin is intentionally placed inside a PRESET (babel-preset-flow-fix)
 * that is listed FIRST in the presets array of babel.config.js.  Because Babel
 * runs presets in REVERSE order, that preset — and therefore this plugin's
 * manipulateOptions — executes AFTER babel-preset-expo has already added
 * `typescript` to parserOpts.  At that point we can safely remove it for Flow
 * files so @babel/parser only sees the `flow` plugin (added by the override's
 * @babel/plugin-transform-flow-strip-types) and does not throw a conflict.
 *
 * Why manipulateOptions and not parserOverride?
 *   parserOverride is NOT a valid Babel plugin property.  It is a programmatic
 *   API option only (babel.transform({parserOverride:…})).  Babel silently
 *   ignores it when returned from a plugin function, making any plugin that
 *   exports it a no-op for parser configuration.  manipulateOptions IS the
 *   correct per-plugin hook for modifying parserOpts before parsing.
 */
module.exports = function babelPluginTsCleanup() {
  return {
    name: 'ts-cleanup-for-flow-files',

    manipulateOptions(opts, parserOpts) {
      const filename = opts.filename || ''
      // Target react-native's own .js files (which still carry Flow annotations
      // in react-native 0.79.x).  The pnpm path looks like:
      //   .../react-native@0.79.x_.../node_modules/react-native/Libraries/...
      // The regex matches both flat npm and nested pnpm layouts.
      if (
        typeof filename === 'string' &&
        /[/\\]react-native[/\\]/.test(filename) &&
        filename.endsWith('.js')
      ) {
        parserOpts.plugins = (parserOpts.plugins || []).filter((p) => {
          const name = Array.isArray(p) ? p[0] : p
          return name !== 'typescript'
        })
      }
    },

    visitor: {},
  }
}
