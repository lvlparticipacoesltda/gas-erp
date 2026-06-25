// Metro config tuned for the pnpm + Turborepo monorepo.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo so `@gas-erp/shared` hot-reloads.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then fall back to the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. pnpm uses symlinks; let Metro follow them. Hierarchical lookup must stay
//    enabled so Metro can resolve pnpm's nested (symlinked) dependencies.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
