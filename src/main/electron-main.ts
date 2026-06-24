import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PlaywrightBrowserController } from "./runs/login-runner.js";
import { AccountLoginLauncher } from "./runs/login-launcher.js";
import { ChromeDebugBrowserController } from "./runs/chrome-debug-browser-controller.js";
import { ManualSessionRunner, SystemChromeProfileOpener } from "./runs/manual-session-runner.js";
import { CryptoVault } from "./crypto/vault.js";
import { ProfileManager } from "./profiles/profile-manager.js";
import { SqliteStore } from "./storage/sqlite-store.js";
import { createAppRuntimeConfig, getDevMasterPassword } from "./app-runtime.js";
import {
  WorkbenchService,
  type CreateAccountInput,
  type CreatePlatformInput,
  type ImportAccountsFromFileInput,
  type SaveLoginAdapterInput
} from "./services/workbench-service.js";
import { createMainWindowOptions } from "./window-options.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let service: WorkbenchService | undefined;
const systemChromeOpener = new SystemChromeProfileOpener();

function requireService(): WorkbenchService {
  if (!service) {
    throw new Error("Vault is locked. Unlock with the local master password first.");
  }
  return service;
}

function createService(masterPassword: string): WorkbenchService {
  const userData = app.getPath("userData");
  const store = new SqliteStore(path.join(userData, "account-workbench.sqlite"));
  const vault = CryptoVault.fromMasterPassword(masterPassword);
  const profiles = new ProfileManager(path.join(userData, "profiles"));
  return new WorkbenchService(store, vault, profiles);
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow(createMainWindowOptions(path.join(__dirname, "preload.js")));

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.handle("vault:unlock", (_event, masterPassword: string) => {
  service = createService(masterPassword);
  return { unlocked: true };
});

ipcMain.handle("app:config", () => createAppRuntimeConfig(process.env));

ipcMain.handle("vault:dev-unlock", () => {
  const config = createAppRuntimeConfig(process.env);
  if (!config.devAutoUnlock) {
    throw new Error("Development auto-unlock is only available while running the local dev server.");
  }

  service = createService(getDevMasterPassword(process.env));
  return { unlocked: true };
});

ipcMain.handle("platforms:list", () => requireService().listPlatforms());
ipcMain.handle("platforms:create", (_event, input: CreatePlatformInput) => requireService().createPlatform(input));
ipcMain.handle("platforms:delete", (_event, platformId: string) => {
  requireService().deletePlatform(platformId);
  return { deleted: true };
});
ipcMain.handle("platforms:create-dola-preset", () => requireService().createDolaPreset());
ipcMain.handle("platforms:create-dola-google-password-preset", () => requireService().createDolaGooglePasswordPreset());
ipcMain.handle("files:pick-account-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "账号文件", extensions: ["txt", "csv", "tsv"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });

  return result.canceled ? undefined : result.filePaths[0];
});
ipcMain.handle("accounts:import-dola-google-file", (_event, input: ImportAccountsFromFileInput) => {
  return requireService().importDolaGoogleAccountsFromFile(input);
});
ipcMain.handle("accounts:list", (_event, platformId?: string) => {
  const active = requireService();
  return platformId ? active.listAccounts(platformId) : active.listAllAccounts();
});
ipcMain.handle("accounts:detail", (_event, accountId: string) => requireService().getAccountDetail(accountId));
ipcMain.handle("accounts:create", (_event, input: CreateAccountInput) => requireService().createAccount(input));
ipcMain.handle("accounts:delete", (_event, accountId: string) => {
  requireService().deleteAccount(accountId);
  return { deleted: true };
});
ipcMain.handle("adapters:save", (_event, input: SaveLoginAdapterInput) => requireService().saveLoginAdapter(input));
ipcMain.handle("adapters:get", (_event, platformId: string) => requireService().getLoginAdapter(platformId));
ipcMain.handle("runs:launch", async (_event, accountId: string) => {
  const active = requireService();
  const launcher = new AccountLoginLauncher({
    service: active,
    browserControllerFactory: () => new PlaywrightBrowserController({ channel: "chrome" }),
    normalChromeBrowserControllerFactory: () => new ChromeDebugBrowserController(),
    manualSessionRunner: new ManualSessionRunner(systemChromeOpener)
  });
  return launcher.launch(accountId);
});

ipcMain.handle("runs:open-session", async (_event, accountId: string) => {
  const active = requireService();
  const account = active.getAccount(accountId);
  const platform = active.getPlatform(account.platformId);
  await systemChromeOpener.openProfile({
    profilePath: active.getProfilePath(accountId),
    url: platform.homeUrl ?? platform.baseUrl
  });
  return { opened: true };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
