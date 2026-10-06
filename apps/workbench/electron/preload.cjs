const { contextBridge, ipcRenderer, webUtils } = require("electron");

function subscribe(channel, callback) {
  const listener = (event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("strata", {
  listNodes: () => ipcRenderer.invoke("nodes:list"),
  openDialog: (options) => ipcRenderer.invoke("dialog:open", options),
  saveDialog: (options) => ipcRenderer.invoke("dialog:save", options),
  readFile: (path) => ipcRenderer.invoke("file:read", path),
  writeFile: (path, text) => ipcRenderer.invoke("file:write", path, text),
  inspectFile: (path) => ipcRenderer.invoke("file:inspect", path),
  checkPaths: (baseDir, entries) => ipcRenderer.invoke("paths:check", { baseDir, entries }),
  collectPaths: (baseDir, entries) => ipcRenderer.invoke("paths:collect", { baseDir, entries }),
  upgradeGraph: (graph, baseDir) => ipcRenderer.invoke("graph:upgrade", { graph, baseDir }),
  runGraph: (graph, baseDir) => ipcRenderer.invoke("graph:run", { graph, baseDir }),
  stopRun: () => ipcRenderer.invoke("graph:stop"),
  openPluginFolder: () => ipcRenderer.invoke("plugins:open"),
  scanPacks: (folder, output, name) => ipcRenderer.invoke("scan:run", { folder, output, name }),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onRunEvent: (callback) => subscribe("run:event", callback),
  onScanProgress: (callback) => subscribe("scan:progress", callback),
});
