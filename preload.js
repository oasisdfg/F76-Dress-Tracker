'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // -> Promise<[{ id, label, dataUrl }]>
  getIcons: () => ipcRenderer.invoke('icons:get'),

  // -> Promise<{ [id]: number }>
  loadCounts: () => ipcRenderer.invoke('counts:load'),

  // -> Promise<true>, written to disk in main (debounced)
  saveCounts: (counts) => ipcRenderer.invoke('counts:save', counts),

  // -> Promise<number> total hunting time in ms, accumulated across runs
  getTimer: () => ipcRenderer.invoke('timer:get'),

  // -> Promise<0>, zeroes the accumulated time
  resetTimer: () => ipcRenderer.invoke('timer:reset')
});
