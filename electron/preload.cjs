const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("smartposNative", {
  printHtml: (html, deviceName) => ipcRenderer.invoke("smartpos:print-html", String(html), deviceName),
  listPrinters: () => ipcRenderer.invoke("smartpos:list-printers"),
  sendRaw: (host, port, bytes) => ipcRenderer.invoke("smartpos:send-raw", String(host), Number(port), bytes),
});
