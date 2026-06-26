import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { PlaywrightBrowserSession, type BrowserController, type BrowserSession } from "./login-runner.js";
import { createChromeExtensionArgs } from "./chrome-launch-options.js";
import { createChromeLaunchCommands, type ChromeCommand } from "./chrome-executable.js";

export class ChromeDebugBrowserController implements BrowserController {
  constructor(private readonly options: { executablePath?: string; extensionPaths?: string[] } = {}) {}

  async openPersistentSession(profilePath: string): Promise<BrowserSession> {
    mkdirSync(profilePath, { recursive: true });
    const port = await this.pickUnusedPort();
    await this.launchChrome(profilePath, port);
    await this.waitForDebugEndpoint(port);

    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    return new PlaywrightBrowserSession(page, browser);
  }

  private createLaunchCommands(profilePath: string, port: number): ChromeCommand[] {
    const args = [
      `--user-data-dir=${profilePath}`,
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-allow-origins=*",
      "--no-first-run",
      ...createChromeExtensionArgs(this.options.extensionPaths),
      "--new-window",
      "about:blank"
    ];

    return createChromeLaunchCommands(args, { executablePath: this.options.executablePath });
  }

  private async launchChrome(profilePath: string, port: number): Promise<void> {
    const commands = this.createLaunchCommands(profilePath, port);
    let lastError: unknown;

    for (const command of commands) {
      try {
        await this.spawnDetached(command.executable, command.args);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to launch Google Chrome.");
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

  private pickUnusedPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Unable to allocate Chrome debugging port."));
          return;
        }

        const port = address.port;
        server.close((error) => (error ? reject(error) : resolve(port)));
      });
    });
  }

  private async waitForDebugEndpoint(port: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          return;
        }
      } catch {
        // Chrome is still starting.
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error("Chrome debugging endpoint did not become available.");
  }
}
