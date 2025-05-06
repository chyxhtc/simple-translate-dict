const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");

const getHTMLPlugins = browser => {
  return [
    new HtmlWebpackPlugin({
      title: "popup",
      filename: "popup/index.html",
      chunks: [`popup`],
      template: `src/popup/index.html`
    }),
    new HtmlWebpackPlugin({
      title: "options",
      filename: "options/index.html",
      chunks: [`options`],
      template: `src/options/index.html`
    }),
    new HtmlWebpackPlugin({
      title: "settings",
      filename: "settings/index.html",
      chunks: [`settings`],
      template: `src/settings/index.html`
    })
  ];
};

const getEntry = browser => {
  const entries = {
    background: `./src/background/background.js`,
    content: `./src/content/content.js`,
    options: `./src/options/index.jsx`,
    popup: `./src/popup/index.jsx`,
    settings: `./src/settings/index.jsx`
  };

  return entries;
};

const getCopyPlugins = browser => {
  return [
    new CopyWebpackPlugin({
      patterns: [
        { from: `src/icons`, to: `icons` },
        { from: `src/_locales`, to: `_locales` },
        { from: `src/manifest-${browser}.json`, to: `manifest.json` }
      ]
    })
  ];
};

const getOutput = (browser, mode, devPath) => {
  let output = mode === "production" ? "dist" : "dist-dev";
  output = browser === "safari" ? `dist/${browser}` : `${output}/${browser}`;
  const outputPath = path.resolve(output);

  return {
    path: outputPath,
    filename: "[name]/[name].js",
    chunkFilename: "[name]/[id].chunk.js"
  };
};

const getZipPlugin = browser => {
  return new ZipPlugin({
    path: path.resolve("web-ext-artifacts", browser),
    filename: `${browser}",
    extension: "zip"
  });
};

const getAnalyzerPlugin = browser => {
  return new BundleAnalyzerPlugin({
    analyzerPort: 8888
  });
};

const getModuleBrowserslist = browser => {
  const browsers = {
    chrome: "last 5 versions",
    firefox: "last 5 versions",
    safari: ["last 2 iOS major versions", "last 2 macOS major versions"],
    edge: "last 5 versions"
  };
  return browsers[browser];
};

module.exports = {
  getHTMLPlugins,
  getEntry,
  getCopyPlugins,
  getOutput,
  getZipPlugin,
  getAnalyzerPlugin,
  getModuleBrowserslist
};
