/* Copyright (c) 2018 Kamil Mikosz
 * Copyright (c) 2019 Sienori
 * Released under the MIT license.
 * see https://opensource.org/licenses/MIT */

const CopyWebpackPlugin = require("copy-webpack-plugin");
const {
  getHTMLPlugins,
  getOutput,
  getCopyPlugins,
  getZipPlugin,
  getFirefoxCopyPlugins,
  getMiniCssExtractPlugin,
  getEntry
} = require("./webpack.utils");
const path = require("path");
const config = require("./config.json");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");

const extVersion = require("./src/manifest-chrome.json").version;
const ffExtVersion = require("./src/manifest-firefox.json").version;

const generalConfig = {
  mode: "production",
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src/"),
      "webextension-polyfill": "webextension-polyfill/dist/browser-polyfill.min.js"
    }
  },
  module: {
    rules: [
      {
        loader: "babel-loader",
        exclude: /node_modules/,
        test: /\.(js|jsx)$/,
        resolve: {
          extensions: [".js", ".jsx"]
        }
      },
      {
        test: /\.(scss|css)$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              esModule: false
            }
          },
          {
            loader: "sass-loader"
          }
        ]
      },
      {
        test: /\.svg$/,
        use: ["@svgr/webpack"]
      }
    ]
  }
};

// 添加环境变量以禁用调试日志
const definePlugin = new webpack.DefinePlugin({
  'process.env': {
    NODE_ENV: JSON.stringify('production')
  },
  // 禁用console.debug
  'console.debug': '(() => {})'
});

// 为Firefox创建XPI插件
const getFirefoxXpiPlugin = (name, outputPath) => {
  const ZipPlugin = require('zip-webpack-plugin');
  return new ZipPlugin({
    path: path.resolve(__dirname, outputPath),
    filename: `${name}.xpi`, // 使用.xpi扩展名而不是.zip
    extension: 'xpi',
    fileOptions: {
      mtime: new Date(),
      mode: 0o100664,
      compress: true,
      forceZip64Format: false,
    }
  });
};

module.exports = [
  {
    ...generalConfig,
    output: getOutput("chrome", config.tempDirectory),
    entry: getEntry(config.chromePath),
    optimization: {
      minimize: true
    },
    plugins: [
      new CleanWebpackPlugin(["dist", "temp"]),
      definePlugin, // 添加环境变量定义
      ...getMiniCssExtractPlugin(),
      ...getHTMLPlugins("chrome", config.tempDirectory, config.chromePath),
      ...getCopyPlugins("chrome", config.tempDirectory, config.chromePath),
      getZipPlugin(`${config.extName}-for-chrome-${extVersion}`, config.distDirectory)
    ]
  },
  {
    ...generalConfig,
    entry: getEntry(config.firefoxPath),
    output: getOutput("firefox", config.tempDirectory),
    optimization: {
      minimize: true
    },
    plugins: [
      new CleanWebpackPlugin(["dist", "temp"]),
      definePlugin, // 添加环境变量定义
      ...getMiniCssExtractPlugin(),
      ...getHTMLPlugins("firefox", config.tempDirectory, config.firefoxPath),
      ...getFirefoxCopyPlugins("firefox", config.tempDirectory, config.firefoxPath),
      // 使用XPI格式而不是ZIP格式
      getFirefoxXpiPlugin(`${config.extName}-for-firefox-${ffExtVersion}`, config.distDirectory)
    ]
  },
  {
    mode: "production",
    resolve: {
      alias: {
        src: path.resolve(__dirname, "src/")
      }
    },
    entry: { other: path.resolve(__dirname, `src/background/background.js`) },
    output: getOutput("copiedSource", config.tempDirectory),
    plugins: [
      definePlugin, // 添加环境变量定义
      new CopyWebpackPlugin({
        patterns: [
          {
            from: `src`,
            to: path.resolve(__dirname, `${config.tempDirectory}/copiedSource/src/`),
            info: { minimized: true }
          },
          {
            from: "*",
            to: path.resolve(__dirname, `${config.tempDirectory}/copiedSource/`),
            globOptions: {
              ignore: ["**/BACKERS.md", "**/crowdin.yml"]
            }
          }
        ]
      }),
      getZipPlugin(`copiedSource-${config.extName}-${ffExtVersion}`, config.distDirectory, "other/")
    ]
  }
];
