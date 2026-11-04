'use strict';

const { contextBridge } = require('electron');

// The desktop UI receives capability information only. No Node or filesystem
// APIs are exposed to web content.
contextBridge.exposeInMainWorld('matDesktop', Object.freeze({
  realBrowser: true,
  platform: process.platform,
  version: '1.0.0'
}));
