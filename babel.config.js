module.exports = function (api) {
  api.cache(true)
  return {
    // ORDERING IS CRITICAL.
    // Babel runs presets in REVERSE order, so babel-preset-expo runs first and
    // babel-preset-flow-fix runs last.  This lets babel-plugin-ts-cleanup (inside
    // babel-preset-flow-fix) remove the `typescript` parser plugin from parserOpts
    // AFTER babel-preset-expo has added it — but only for react-native .js files
    // where the `flow` parser plugin was already added by the override below.
    presets: ['./babel-preset-flow-fix', 'babel-preset-expo'],

    plugins: ['@babel/plugin-transform-export-namespace-from'],

    // Strip Flow type AST nodes from react-native's .js files so the code
    // generator never emits raw Flow syntax.  This plugin also adds `flow` to
    // parserOpts (via @babel/plugin-syntax-flow) which, combined with the
    // babel-plugin-ts-cleanup removing `typescript`, leaves only the Flow parser
    // active for these files.
    overrides: [
      {
        test: (filename) =>
          typeof filename === 'string' &&
          /[/\\]react-native[/\\]/.test(filename) &&
          filename.endsWith('.js'),
        plugins: [
          ['@babel/plugin-transform-flow-strip-types', { requireDirective: false }],
        ],
      },
    ],
  }
}
