// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

// module.exports = (on, config) => {
// `on` is used to hook into various events Cypress emits
// `config` is the resolved Cypress config
// };

const { initPlugin } = require('cypress-plugin-snapshots/plugin');
const fs = require('fs');
const autoRecord = require('cypress-autorecord/plugin');
const cypressTypeScriptPreprocessor = require('./ts-preprocess');

module.exports = (on, config) => {
  initPlugin(on, config);
  on('task', require('@cypress/code-coverage/task'));
  on('file:preprocessor', require('@cypress/code-coverage/use-babelrc'));
  on('file:preprocessor', cypressTypeScriptPreprocessor);
  autoRecord(on, config, fs);
  return config;
};
