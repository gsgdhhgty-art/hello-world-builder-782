const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("node:path");
const net = require("node:net");

const APP_URL = process.env.SMARTPOS_APP_URL;

function isAppUrl(url) {
  try {
    const u = new URL(url);
    if (APP_URL) return u.origin === new URL(APP_URL).origin;
    return u.protocol === "file:";
  } catch {
    return false;
  }
}

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
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    // Customer display opens as a second in-app window (move it to the customer monitor).
    if (isAppUrl(url) && url.includes("customer-display")) {
      return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1024, height: 700 } };
    }
    if (!isAppUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (APP_URL) void window.loadURL(APP_URL);
  else void window.loadFile(path.join(__dirname, "..", "dist", "client", "index.html"));
}

ipcMain.handle("smartpos:list-printers", async (event) => {
  const list = await event.sender.getPrintersAsync();
  return list.map((p) => ({ name: p.name, isDefault: Boolean(p.isDefault) }));
});

ipcMain.handle("smartpos:print-html", async (_event, html, deviceName) => {
  if (typeof html !== "string" || html.length > 2_000_000) return { ok: false, error: "Invalid receipt" };
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    return await new Promise((resolve) => {
      win.webContents.print(
        { silent: true, printBackground: true, ...(deviceName ? { deviceName: String(deviceName) } : {}) },
        (ok, error) => resolve({ ok, error: ok ? undefined : error }),
      );
    });
  } finally {
    setTimeout(() => win.destroy(), 1000);
  }
});

ipcMain.handle("smartpos:send-raw", async (_event, host, port, bytes) => {
  if (!/^[a-z0-9.-]{1,253}$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Invalid printer address" };
  }
  if (!Array.isArray(bytes) || bytes.length > 4096) return { ok: false, error: "Invalid payload" };
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 4000 }, () => {
      socket.end(Buffer.from(bytes.map((b) => Number(b) & 0xff)), () => resolve({ ok: true }));
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "انتهت مهلة الاتصال بالطابعة" });
    });
    socket.on("error", (err) => resolve({ ok: false, error: err.message }));
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
