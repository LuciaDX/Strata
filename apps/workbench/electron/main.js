import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerEngine } from "./engine.js";

const here = dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#151414",
    title: "Strata",
    icon: join(here, "..", "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  if (process.env.STRATA_DEV_URL) {
    window.loadURL(process.env.STRATA_DEV_URL);
  } else {
    window.loadFile(join(here, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  registerEngine(app.getPath("userData"));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
