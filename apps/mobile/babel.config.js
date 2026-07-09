module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) handles modern syntax + Reanimated 4; nativewind/babel
    // (css-interop) injects react-native-worklets/plugin — so no manual plugins needed.
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
