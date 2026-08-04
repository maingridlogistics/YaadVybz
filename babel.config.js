module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // babel-preset-expo configures @babel/preset-typescript with allExtensions: true
          // by default, which makes it try to parse ALL .js files as TypeScript — including
          // react-native's internal Flow-annotated files (AppRegistry.js etc.).
          // Babel cannot run both the `flow` and `typescript` parser plugins simultaneously;
          // the TypeScript parser produces a malformed AST for Flow syntax, causing errors
          // like ":' or '?' expected" and "invalid expression" in AppRegistry.js.
          //
          // Setting allExtensions: false restricts TypeScript parsing to .ts/.tsx files only.
          // Our project source files are all .ts/.tsx so nothing breaks on our side.
          // React Native's .js files are left for the standard JS parser and are no longer
          // misinterpreted as TypeScript.
          typescript: { allExtensions: false },
        },
      ],
    ],
    plugins: ['@babel/plugin-transform-export-namespace-from'],
  }
}
