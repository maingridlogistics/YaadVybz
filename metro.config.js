const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Preserve the existing cache version setting.
config.cacheVersion = 'default-config';

module.exports = config;
