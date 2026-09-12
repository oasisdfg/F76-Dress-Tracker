'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // -> Promise<[{ id, label, dataUrl, under }]>, under is set on small tiles
  getIcons: () => ipcRenderer.invoke('icons:get'),

  // -> Promise<{ [id]: number }>
  loadCounts: () => ipcRenderer.invoke('counts:load'),

  // -> Promise<true>, written to disk in main (debounced)
  saveCounts: (counts) => ipcRenderer.invoke('counts:save', counts),

  // -> Promise<{ elapsedMs, paused }>, hunting time accumulated across runs
  getTimer: () => ipcRenderer.invoke('timer:get'),

  // -> Promise<{ elapsedMs, paused }>, flips between running and paused
  toggleTimer: () => ipcRenderer.invoke('timer:toggle'),

  // -> Promise<{ elapsedMs, paused }>, zeroes the accumulated time
  resetTimer: () => ipcRenderer.invoke('timer:reset')
});
