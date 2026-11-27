const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "desktopPreview",
  Object.freeze({
    isDesktop: true,
    status: () => ipcRenderer.invoke("preview:status"),
    retry: () => ipcRenderer.invoke("preview:retry"),
    chooseMongo: () => ipcRenderer.invoke("preview:choose-mongo"),
    configure: (connection) =>
      ipcRenderer.invoke("preview:configure", connection),
    activateRecovery: (database, password) =>
      ipcRenderer.invoke("preview:activate-recovery", { database, password }),
    onStatus: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on("preview:status-update", listener);
      return () =>
        ipcRenderer.removeListener("preview:status-update", listener);
    },
  }),
);
