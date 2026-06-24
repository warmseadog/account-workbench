import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateAccountInput,
  CreatePlatformInput,
  ImportAccountsFromFileInput,
  SaveLoginAdapterInput
} from "./services/workbench-service.js";

const accountWorkbench = {
  getAppConfig: () => ipcRenderer.invoke("app:config"),
  unlockVault: (masterPassword: string) => ipcRenderer.invoke("vault:unlock", masterPassword),
  devUnlockVault: () => ipcRenderer.invoke("vault:dev-unlock"),
  pickAccountFile: () => ipcRenderer.invoke("files:pick-account-file"),
  listPlatforms: () => ipcRenderer.invoke("platforms:list"),
  createPlatform: (input: CreatePlatformInput) => ipcRenderer.invoke("platforms:create", input),
  deletePlatform: (platformId: string) => ipcRenderer.invoke("platforms:delete", platformId),
  createDolaPreset: () => ipcRenderer.invoke("platforms:create-dola-preset"),
  createDolaGooglePasswordPreset: () => ipcRenderer.invoke("platforms:create-dola-google-password-preset"),
  importDolaGoogleAccountsFromFile: (input: ImportAccountsFromFileInput) => ipcRenderer.invoke("accounts:import-dola-google-file", input),
  listAccounts: (platformId?: string) => ipcRenderer.invoke("accounts:list", platformId),
  getAccountDetail: (accountId: string) => ipcRenderer.invoke("accounts:detail", accountId),
  createAccount: (input: CreateAccountInput) => ipcRenderer.invoke("accounts:create", input),
  deleteAccount: (accountId: string) => ipcRenderer.invoke("accounts:delete", accountId),
  saveLoginAdapter: (input: SaveLoginAdapterInput) => ipcRenderer.invoke("adapters:save", input),
  getLoginAdapter: (platformId: string) => ipcRenderer.invoke("adapters:get", platformId),
  launchLogin: (accountId: string) => ipcRenderer.invoke("runs:launch", accountId),
  openSession: (accountId: string) => ipcRenderer.invoke("runs:open-session", accountId)
};

contextBridge.exposeInMainWorld("accountWorkbench", accountWorkbench);

export type AccountWorkbenchBridge = typeof accountWorkbench;
