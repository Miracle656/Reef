module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) handles modern syntax + Reanimated 4; nativewind/babel
    // (css-interop) injects react-native-worklets/plugin.
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    // @mysten/sui ships .mjs with static class blocks, which Hermes can't run and
    // the preset doesn't lower here — transform them explicitly.
    plugins: ["@babel/plugin-transform-class-static-block"],
  };
};
