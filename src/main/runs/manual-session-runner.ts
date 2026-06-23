import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import type { LoginRun, Platform } from "../../shared/models.js";

export interface ManualBrowserOpenRequest {
  profilePath: string;
  url: string;
}

export interface ManualBrowserOpener {
  openProfile(request: ManualBrowserOpenRequest): Promise<void>;
}

export interface ManualSessionRunInput {
  accountId: string;
  profilePath: string;
  platform: Platform;
}

export class ManualSessionRunner {
  constructor(private readonly opener: ManualBrowserOpener) {}

  async run(input: ManualSessionRunInput): Promise<LoginRun> {
    const run = this.createRun(input.accountId);
    const step = (status: LoginRun["status"], message: string): void => {
      run.status = status;
      run.steps.push({ at: new Date().toISOString(), status, message });
    };

    step("opening_browser", "正在用普通 Chrome 打开该账号的独立 Profile。");
    try {
      await this.opener.openProfile({
        profilePath: input.profilePath,
        url: input.platform.loginUrl || input.platform.homeUrl || input.platform.baseUrl
      });
    } catch {
      step("failed", "无法打开普通 Chrome 独立 Profile；请确认本机已安装 Google Chrome，并关闭同一账号的已打开窗口后重试。");
      run.errorCode = "browser_profile_unavailable";
      run.endedAt = new Date().toISOString();
      return run;
    }

    step(
      "manual_handoff",
      "已用普通 Chrome 打开独立 Profile。请在窗口内手动完成 Google、手机号、验证码、短信或 2FA 登录；完成后这个 Profile 会保留会话。"
    );
    run.requiresManual = true;
    return run;
  }

  private createRun(accountId: string): LoginRun {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      accountId,
      status: "queued",
      startedAt: now,
      steps: [],
      requiresManual: false
    };
  }
}

export class SystemChromeProfileOpener implements ManualBrowserOpener {
  async openProfile(request: ManualBrowserOpenRequest): Promise<void> {
    mkdirSync(request.profilePath, { recursive: true });
    const launchCommands = this.createLaunchCommands(request);
    let lastError: unknown;

    for (const command of launchCommands) {
      try {
        await this.spawnDetached(command.executable, command.args);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to launch Google Chrome.");
  }

  private createLaunchCommands(request: ManualBrowserOpenRequest): Array<{ executable: string; args: string[] }> {
    const chromeArgs = [`--user-data-dir=${request.profilePath}`, "--no-first-run", "--new-window", request.url];

    if (process.platform === "darwin") {
      return [{ executable: "open", args: ["-na", "Google Chrome", "--args", ...chromeArgs] }];
    }

    if (process.platform === "win32") {
      return [{ executable: "cmd.exe", args: ["/c", "start", "", "chrome", ...chromeArgs] }];
    }

    return ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"].map((executable) => ({
      executable,
      args: chromeArgs
    }));
  }

  private spawnDetached(executable: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { detached: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }
}
