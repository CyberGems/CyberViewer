'use strict';

const path = require('node:path');
const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isPortableDataBuild, portableExecutableFile, portableUserDataPath } = require('../lib/portable-data');

const keys = ['PORTABLE_EXECUTABLE_DIR', 'PORTABLE_EXECUTABLE_FILE'];
const original = new Map(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('portable data paths', () => {
  it('leaves installed builds on the normal userData path', () => {
    delete process.env.PORTABLE_EXECUTABLE_DIR;
    delete process.env.PORTABLE_EXECUTABLE_FILE;
    assert.equal(isPortableDataBuild(), false);
    assert.equal(portableUserDataPath(), null);
    assert.equal(portableExecutableFile(), '');
  });

  it('keeps portable settings beside the executable', () => {
    const directory = path.join('apps', 'CyberViewer');
    const executable = path.join(directory, 'CyberViewer.exe');
    process.env.PORTABLE_EXECUTABLE_DIR = directory;
    process.env.PORTABLE_EXECUTABLE_FILE = executable;
    assert.equal(isPortableDataBuild(), true);
    assert.equal(portableUserDataPath(), path.join(directory, 'data'));
    assert.equal(portableExecutableFile(), executable);
  });
});
