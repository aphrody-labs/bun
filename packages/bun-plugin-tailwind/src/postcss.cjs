// PostCSS loads plugins with `require(name)(options)`: export the plugin creator itself.
module.exports = require("./postcss.ts").default;
