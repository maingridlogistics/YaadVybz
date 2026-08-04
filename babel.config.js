module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@babel/plugin-transform-export-namespace-from'],

    // ─── Parser conflict resolution ──────────────────────────────────────────
    // react-native 0.79.x ships several .js files (AppRegistry.js, etc.) that
    // still carry Flow type annotations.  babel-preset-expo enables
    // @babel/preset-typescript with allExtensions:true, which forces the
    // TypeScript parser onto every .js file — including those Flow-annotated
    // ones.  @babel/parser cannot run both the `typescript` and `flow` plugins
    // simultaneously; it throws "Mixtures of Flow and TypeScript annotations are
    // not supported", which manifests as the AppRegistry.js SyntaxErrors in the
    // Android AAB build.
    //
    // parserOverride is called by @babel/core BEFORE @babel/parser runs, so we
    // can filter the plugin list before the conflict check fires inside the
    // parser itself.  The logic is:
    //   • When both 'flow' and 'typescript' appear in opts.plugins (conflict):
    //       – file has @flow  → keep flow, drop typescript  (Flow file)
    //       – file has no @flow → keep typescript, drop flow  (TS/JS file)
    //   • No conflict → pass opts through unchanged.
    parserOverride: (code, opts, parse) => {
      const plugins = opts.plugins || []
      const hasFlow = plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'flow')
      const hasTs = plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'typescript')

      if (hasFlow && hasTs) {
        const isFlowFile = typeof code === 'string' && code.includes('@flow')
        const filtered = plugins.filter((p) => {
          const name = Array.isArray(p) ? p[0] : p
          // For Flow files: keep flow, remove typescript
          // For TS/JS files: keep typescript, remove flow
          return isFlowFile ? name !== 'typescript' : name !== 'flow'
        })
        return parse(code, { ...opts, plugins: filtered })
      }

      return parse(code, opts)
    },

    // Strip Flow type nodes from the AST for react-native's .js files so that
    // Babel's code generator does not emit raw Flow syntax in the bundle.
    // requireDirective:false ensures ALL type annotations are stripped even
    // when the file lacks an explicit @flow pragma comment.
    overrides: [
      {
        test: (filename) =>
          typeof filename === 'string' &&
          /\/react-native\//.test(filename) &&
          filename.endsWith('.js'),
        plugins: [
          ['@babel/plugin-transform-flow-strip-types', { requireDirective: false }],
        ],
      },
    ],
  }
}
