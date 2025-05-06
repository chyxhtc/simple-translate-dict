module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          browsers: ["defaults", "not IE 11"]
        },
        modules: false
      }
    ],
    "@babel/preset-react"
  ],
  plugins: [
    "@babel/plugin-proposal-object-rest-spread",
    "@babel/plugin-proposal-optional-chaining"
  ]
};
