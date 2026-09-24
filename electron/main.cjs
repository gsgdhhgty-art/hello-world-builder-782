const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const APP_URL =
  process.env.SMARTPOS_APP_URL ||
  "https://project--2cdd9e5d-1351-4d1d-aac6-5f7d61c3fcf8.lovable.app";

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#f7f9fc",
    icon: path.join(__dirname, "..", "public", "pwa-512.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin !== new URL(APP_URL).origin) void shell.openExternal(url);
    return { action: "deny" };
  });

  void window.loadURL(APP_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});