// Metro has to be told about the monorepo: the app lives in apps/mobile but
// imports @choreshift/engine from packages/engine, which is outside its root.
// Without watchFolders, edits to the engine would not trigger a reload; without
// nodeModulesPaths, its imports would not resolve at all.
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
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
