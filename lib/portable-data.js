'use strict';

const path = require('path');

// electron-builder sets PORTABLE_EXECUTABLE_DIR only for its portable target.
function isPortableDataBuild() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

// process.execPath points at the copy extracted into %TEMP%. Startup entries
// and shell integrations must use the executable the user actually launched.
function portableExecutableFile() {
  return process.env.PORTABLE_EXECUTABLE_FILE || '';
}

// Portable settings, session and backups live in a `data` folder beside the
// executable so the whole setup can travel together.
function portableUserDataPath() {
  const directory = process.env.PORTABLE_EXECUTABLE_DIR;
  return directory ? path.join(directory, 'data') : null;
}

module.exports = { isPortableDataBuild, portableExecutableFile, portableUserDataPath };
