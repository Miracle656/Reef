const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Root has a real (non-symlinked) hoisted copy of react/react-dom separate
// from the pnpm-store copy apps/mobile symlinks to. Without this, Metro's
// default hierarchical directory walk can resolve "react" to whichever
// physical copy is nearest the requiring file, producing two dispatcher
// singletons in one bundle -> "Invalid hook call" / null dispatcher in core
// RN components (e.g. View's `use(TextAncestorContext)`).
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
