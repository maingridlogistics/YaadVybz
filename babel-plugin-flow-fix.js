/**
 * babel-plugin-flow-fix
 *
 * Resolves the Flow / TypeScript parser conflict that occurs when
 * babel-preset-expo enables @babel/preset-typescript with allExtensions:true
 * and react-native 0.79.x ships .js files that still contain Flow annotations.
 *
 * @babel/parser cannot have both the `typescript` and `flow` parser plugins
 * active simultaneously.  A Babel plugin may export `parserOverride` which is
 * called *before* @babel/parser runs, giving us the chance to filter the
 * conflicting plugin out of opts.plugins before the parser conflict check fires.
 *
 * Logic:
 *   conflict (both flow + typescript in opts.plugins)?
 *     file contains "@flow"  → keep flow,  drop typescript  (Flow-annotated JS)
 *     file has no "@flow"    → keep typescript, drop flow   (regular TS/JS)
 *   no conflict → pass through unchanged
 */
module.exports = function flowFixPlugin() {
  return {
    name: 'flow-fix',

    // parserOverride is a first-class Babel 7 plugin API:
    // https://babeljs.io/docs/babel-core#optionsparseroverride
    parserOverride(code, opts, parse) {
      const plugins = opts.plugins || []

      const hasFlow = plugins.some((p) => {
        const name = Array.isArray(p) ? p[0] : p
        return name === 'flow' || name === 'flow_comments'
      })
      const hasTs = plugins.some((p) => {
        const name = Array.isArray(p) ? p[0] : p
        return name === 'typescript'
      })

      if (hasFlow && hasTs) {
        const isFlowFile = typeof code === 'string' && code.includes('@flow')
        const filtered = plugins.filter((p) => {
          const name = Array.isArray(p) ? p[0] : p
          if (isFlowFile) {
            // Flow file: remove TypeScript parser plugin
            return name !== 'typescript'
          } else {
            // TS/JS file: remove Flow parser plugins
            return name !== 'flow' && name !== 'flow_comments'
          }
        })
        return parse(code, { ...opts, plugins: filtered })
      }

      return parse(code, opts)
    },

    visitor: {},
  }
}
