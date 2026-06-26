import { LoginRunner, type BrowserController } from "./login-runner.js";
import type { ManualSessionRunner } from "./manual-session-runner.js";
import type { AccountSecrets, BundledChromeExtensionStatus, LoginAdapter, LoginRun, Platform } from "../../shared/models.js";
import type { AccountSummary } from "../services/workbench-service.js";

export interface LoginLaunchService {
  getAccount(accountId: string): AccountSummary;
  getPlatform(platformId: string): Platform;
  getLoginAdapter(platformId: string): LoginAdapter | undefined;
  getAccountSecrets(accountId: string): AccountSecrets;
  getProfilePath(accountId: string): string;
}

export interface AccountLoginLauncherOptions {
  service: LoginLaunchService;
  browserControllerFactory: () => BrowserController;
  normalChromeBrowserControllerFactory: () => BrowserController;
  manualSessionRunner: ManualSessionRunner;
  chromeExtensionStatus?: BundledChromeExtensionStatus;
}

export type LoginLaunchMode = "manual_session" | "normal_chrome_flow" | "playwright_flow";

export class AccountLoginLauncher {
  constructor(private readonly options: AccountLoginLauncherOptions) {}

  async launch(accountId: string): Promise<LoginRun> {
    const account = this.options.service.getAccount(accountId);
    const platform = this.options.service.getPlatform(account.platformId);
    const adapter = this.options.service.getLoginAdapter(platform.id);
    if (!adapter) {
      throw new Error("No login adapter is configured for this platform.");
    }

    const profilePath = this.options.service.getProfilePath(accountId);
    const launchMode = selectLoginLaunchMode(platform, adapter);
    if (launchMode === "manual_session") {
      return this.options.manualSessionRunner.run({ accountId, platform, profilePath });
    }

    const browserController =
      launchMode === "normal_chrome_flow"
        ? this.options.normalChromeBrowserControllerFactory()
        : this.options.browserControllerFactory();

    return new LoginRunner(browserController, {
      manualContinueWaitMs: 90_000,
      manualContinuePollMs: 500,
      chromeExtensionStatus: this.options.chromeExtensionStatus
    }).run({
      accountId,
      platform,
      adapter,
      credentials: this.options.service.getAccountSecrets(accountId),
      profilePath
    });
  }
}

export function selectLoginLaunchMode(platform: Platform, adapter: LoginAdapter): LoginLaunchMode {
  if (adapter.authMode === "manual_session") {
    return "manual_session";
  }

  const usesGoogleOAuth = platform.allowedOrigins.some((originOrUrl) => {
    try {
      return new URL(originOrUrl).origin === "https://accounts.google.com";
    } catch {
      return false;
    }
  });

  if (adapter.authMode === "flow_password" && usesGoogleOAuth) {
    return "normal_chrome_flow";
  }

  return "playwright_flow";
}
