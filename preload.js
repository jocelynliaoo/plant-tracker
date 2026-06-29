/**
 * preload.js
 *
 * Runs in a privileged context before the renderer page loads.
 * Exposes a safe, narrow API to the renderer via contextBridge â€”
 * the renderer never gets direct access to Node.js or Electron internals.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plantAPI', {
  // Load saved plant data from disk
  getState: () => ipcRenderer.invoke('get-state'),

  // Save plant data (name, watering day) to disk
  saveState: (data) => ipcRenderer.invoke('save-state', data),

  // Log a watering event
  logWatering: () => ipcRenderer.invoke('log-watering'),

  // Reset everything (start over)
  resetState: () => ipcRenderer.invoke('reset-state'),

  // Listen for state updates pushed from main (e.g. tray "Log watering now")
  onStateUpdated: (callback) => {
    ipcRenderer.on('state-updated', (_, state) => callback(state));
  },
});