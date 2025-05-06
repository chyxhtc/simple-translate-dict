const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { getHTMLPlugins, getOutput, getCopyPlugins, getEntry, getModuleBrowserslist } = require("./webpack.utils");
const path = require("path");

const browsers = ["chrome", "firefox"];
const mode = process.env.NODE_ENV || "development";
const isBrowserTarget = browsers.findIndex(b => process.env.BROWSER === b) !== -1;
const browser = isBrowserTarget ? process.env.BROWSER : "chrome";

let entry = getEntry(browser);
let htmlPlugins = getHTMLPlugins(browser);
let copyPlugins = getCopyPlugins(browser);
let output = getOutput(browser, mode, "dev");

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
        test: /\.css$/,
        use: [{ loader: "css-loader" }]
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: "css-loader",
            options: {
              modules: {
                localIdentName: "[local]___[hash:base64:5]"
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
  plugins: [...copyPlugins, ...htmlPlugins, new webpack.DefinePlugin({})]
};

module.exports = config;
