const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");
const path = require("path");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const {
  getHTMLPlugins,
  getOutput,
  getCopyPlugins,
  getZipPlugin,
  getEntry,
  getAnalyzerPlugin,
  getModuleBrowserslist
} = require("./webpack.utils");

const browsers = ["chrome", "firefox"];
const mode = process.env.NODE_ENV || "development";
const isBrowserTarget = browsers.findIndex(b => process.env.BROWSER === b) !== -1;
const browser = isBrowserTarget ? process.env.BROWSER : "chrome";
const isProduction = mode === "production";
const analyze = process.env.NODE_ENV === "analyze";

let entry = getEntry(browser);
let htmlPlugins = getHTMLPlugins(browser);
let copyPlugins = getCopyPlugins(browser);
const finalCopyPlugins = [...copyPlugins];
let output = getOutput(browser, mode, "");
let zipPlugin = getZipPlugin(browser);
let analyzerPlugin = null;
if (analyze) analyzerPlugin = getAnalyzerPlugin(browser);

const config = {
  mode,
  entry,
  output,
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        include: [path.resolve(__dirname, "src")],
        use: [
          {
            loader: "babel-loader"
          }
        ]
      },
      {
        test: /\.svg$/,
        use: [
          {
            loader: "@svgr/webpack",
            options: {
              svgoConfig: {
                plugins: [
                  {
                    name: "removeViewBox",
                    active: false
                  }
                ]
              }
            }
          }
        ]
      },
      {
        type: "javascript/auto",
        test: /\.json$/,
        include: [path.resolve(__dirname, "src")],
        exclude: /node_modules/
      },
      {
        test: /\.s?css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              modules: {
                localIdentName: "[name]__[local]___[hash:base64:5]"
              }
            }
          },
          "sass-loader"
        ]
      }
    ]
  },
  resolve: {
    extensions: ["*", ".js", ".jsx", ".json"]
  },
  plugins: [
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: ["*", path.resolve(process.cwd(), `web-ext-artifacts/${browser}/*`)]
    }),
    new webpack.DefinePlugin({
      "process.env": {
        NODE_ENV: JSON.stringify(mode)
      }
    }),
    new MiniCssExtractPlugin({
      filename: "[name]/css/styles.css"
    }),
    ...finalCopyPlugins,
    ...htmlPlugins
  ].filter(Boolean)
};

if (zipPlugin) {
  config.plugins.push(zipPlugin);
}
if (analyzerPlugin) {
  config.plugins.push(analyzerPlugin);
}

module.exports = config;
