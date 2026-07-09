// Monorepo-aware Metro config with NativeWind.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
// Watch the whole monorepo so @umbra/* workspace packages resolve + hot-reload.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const nwConfig = withNativeWind(config, { input: "./global.css" });

// Lazy/inline requires: defer each require to its use-site instead of running
// it at module top-level. This is the standard fix for @mysten/sui's ESM
// circular dependencies (a `class X extends Y` evaluating before Y's module has
// finished → "Cannot read property 'prototype' of undefined"). Off by default in
// dev, so enable it explicitly.
nwConfig.transformer = {
  ...nwConfig.transformer,
  getTransformOptions: async () => ({
    transform: { experimentalImportSupport: false, inlineRequires: true },
  }),
};

// Single React copy — node-linker=hoisted can otherwise expose web's React to
// mobile's hoisted deps (NativeWind/css-interop), causing "more than one copy of
// React". Resolve every react / react/* request from the mobile app root.
const upstreamResolve = nwConfig.resolver.resolveRequest;
nwConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "index.js") },
      moduleName,
      platform,
    );
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = nwConfig;
