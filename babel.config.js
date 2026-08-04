module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must be listed FIRST so its parserOverride fires before @babel/parser
      // runs on any file.  See babel-plugin-flow-fix.js for full explanation.
      './babel-plugin-flow-fix',
      '@babel/plugin-transform-export-namespace-from',
    ],

    // Strip Flow type AST nodes from react-native's .js files so Babel's
    // code generator never emits raw Flow syntax in the bundle.
    // requireDirective:false strips ALL annotations, even without @flow pragma.
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
