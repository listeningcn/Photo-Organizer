import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { ImportProgress, PhotoApi } from '@shared/api';

const api: PhotoApi = {
  platform: process.platform,
  removeFolder: (path) => ipcRenderer.invoke('folders:remove', path),
  getPreference: (key) => ipcRenderer.invoke('preferences:get', key),
  setPreference: (key, value) => ipcRenderer.invoke('preferences:set', key, value),
  status: () => ipcRenderer.invoke('vault:status'),
  setup: (password) => ipcRenderer.invoke('vault:setup', password),
  unlock: (password) => ipcRenderer.invoke('vault:unlock', password),
  lock: () => ipcRenderer.invoke('vault:lock'),
  addFolder: () => ipcRenderer.invoke('folders:add'),
  rescan: () => ipcRenderer.invoke('folders:rescan'),
  cancelImport: () => ipcRenderer.invoke('import:cancel'),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  listPhotos: () => ipcRenderer.invoke('photos:list'),
  hiddenCount: () => ipcRenderer.invoke('photos:hiddenCount'),
  hideAuthorized: () => ipcRenderer.invoke('photos:hideAuthorized'),
  listHidden: (password) => ipcRenderer.invoke('photos:listHidden', password),
  hidePhoto: (id, password) => ipcRenderer.invoke('photos:hide', id, password),
  restorePhoto: (id) => ipcRenderer.invoke('photos:restore', id),
  photoDetails: (id) => ipcRenderer.invoke('photos:details', id),
  getEventTitles: () => ipcRenderer.invoke('events:titles'),
  setEventTitle: (key, title) => ipcRenderer.invoke('events:setTitle', key, title),
  onImportProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: ImportProgress) =>
      callback(progress);
    ipcRenderer.on('import:progress', listener);
    return () => ipcRenderer.removeListener('import:progress', listener);
  },
  onLocked: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('vault:locked', listener);
    return () => ipcRenderer.removeListener('vault:locked', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
