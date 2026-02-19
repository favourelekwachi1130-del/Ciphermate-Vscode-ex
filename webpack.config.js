//@ts-check

'use strict';

const path = require('path');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // Exclude native SQLite modules that can't be bundled
    '@mastra/libsql': 'commonjs @mastra/libsql',
    '@libsql/client': 'commonjs @libsql/client',
    '@libsql/core': 'commonjs @libsql/core',
    'libsql': 'commonjs libsql',
    'better-sqlite3': 'commonjs better-sqlite3',
    // Mastra + AI SDK - resolve from node_modules at runtime (subpaths needed)
    '@mastra/core': 'commonjs @mastra/core',
    '@mastra/core/agent': 'commonjs @mastra/core/agent',
    '@mastra/memory': 'commonjs @mastra/memory',
    '@mastra/memory/processors': 'commonjs @mastra/memory/processors',
    '@mastra/fastembed': 'commonjs @mastra/fastembed',
    '@ai-sdk/openai': 'commonjs @ai-sdk/openai',
    'openai': 'commonjs openai',
    'zod': 'commonjs zod',
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules|__tests__/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};
module.exports = [ extensionConfig ];