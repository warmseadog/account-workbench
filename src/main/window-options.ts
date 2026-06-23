import type { BrowserWindowConstructorOptions } from "electron";

export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: "账号工作台",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}
