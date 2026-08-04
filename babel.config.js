module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@babel/plugin-transform-export-namespace-from'],
    overrides: [
      {
        // react-native internal .js files use Flow type annotations (e.g. AppRegistry.js).
        // @babel/core >=7.27 runs @babel/preset-typescript with allExtensions mode, which
        // trips over Flow shorthand syntax like `{ appKey, }` expecting `{ appKey: Type }`.
        // Stripping Flow annotations here ensures they are gone before TypeScript parsing.
        test: /node_modules[/\\]react-native[/\\]/,
        plugins: ['@babel/plugin-transform-flow-strip-types'],
      },
    ],
  }
}
