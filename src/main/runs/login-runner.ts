import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { LoginAdapterRules } from "../adapters/login-adapter.js";
import type { AccountSecrets, LoginAdapter, LoginFlowStep, LoginRun, LoginRunStatus, Platform } from "../../shared/models.js";

export type LoginResult = "success" | "failure" | "manual" | "unknown";

export interface LoginRunContext {
  accountId: string;
  profilePath: string;
  platform: Platform;
  adapter: LoginAdapter;
  credentials: AccountSecrets;
}

export interface BrowserSession {
  currentUrl(): Promise<string>;
  goto(url: string): Promise<void>;
  focusLocator?(locator: string, timeoutMs?: number): Promise<void>;
  fill(locator: string, value: string): Promise<void>;
  click(locator: string): Promise<void>;
  isVisible(locator: string): Promise<boolean>;
  detectLoginResult(context: LoginRunContext): Promise<LoginResult>;
  waitForLoginResult(context: LoginRunContext): Promise<LoginResult>;
}

export interface BrowserController {
  openPersistentSession(profilePath: string): Promise<BrowserSession>;
}

export interface LoginRunnerOptions {
  manualContinueWaitMs?: number;
  manualContinuePollMs?: number;
}

export class LoginRunner {
  constructor(
    private readonly browser: BrowserController,
    private readonly options: LoginRunnerOptions = {}
  ) {}

  async run(context: LoginRunContext): Promise<LoginRun> {
    LoginAdapterRules.validateSelectors(context.adapter);
    const originRules = new LoginAdapterRules({ allowedOrigins: context.platform.allowedOrigins });
    const authMode = context.adapter.authMode ?? "password";
    const run = this.createRun(context.accountId);
    const step = (status: LoginRunStatus, message: string): void => {
      run.status = status;
      run.steps.push({ at: new Date().toISOString(), status, message });
    };
    const fail = (errorCode: string, message: string): LoginRun => {
      step("failed", message);
      run.errorCode = errorCode;
      run.endedAt = new Date().toISOString();
      return run;
    };
    const finishDetectedResult = (result: LoginResult): LoginRun | undefined => {
      if (result === "success") {
        step("succeeded", "Login completed and session profile can be reused.");
        run.endedAt = new Date().toISOString();
        return run;
      }

      if (result === "failure") {
        return fail("login_failed", "The site reported a login failure.");
      }

      if (result === "manual") {
        step(
          "manual_handoff",
          "当前页面显示手机号、扫码、验证码、短信、2FA 或 Google 不安全浏览器提示等手动步骤；已停止自动填充并交给你手动处理。"
        );
        run.requiresManual = true;
        return run;
      }

      return undefined;
    };

    step("opening_browser", "正在打开该账号的独立浏览器 Profile。");
    let session: BrowserSession;
    try {
      session = await this.browser.openPersistentSession(context.profilePath);
    } catch {
      return fail(
        "browser_profile_unavailable",
        "无法打开该账号的独立浏览器 Profile；如果这个账号的独立 Chrome 窗口已经打开，请先关闭该窗口后重试。"
      );
    }
    const currentUrl = await session.currentUrl();

    if (this.isStartupUrl(currentUrl)) {
      await session.goto(context.platform.loginUrl);
    } else if (this.isConcreteUrl(currentUrl) && !originRules.isAllowedUrl(currentUrl)) {
      return fail("origin_not_allowed", "Current browser URL is outside the configured platform origins.");
    }

    if (!this.isConcreteUrl(await session.currentUrl())) {
      await session.goto(context.platform.loginUrl);
    }

    const loginUrl = await session.currentUrl();
    if (!originRules.isAllowedUrl(loginUrl)) {
      return fail("origin_not_allowed", "Login page URL is outside the configured platform origins.");
    }

    if (authMode === "manual_session") {
      if (context.adapter.startLocator) {
        step("checking_session", "正在打开配置好的登录入口，用于手动建立会话。");
        await this.click(session, context.adapter.startLocator);
      }

      step("waiting_for_result", "正在等待已有会话，或等待手动完成 Google/手机号/验证登录。");
      const result = await session.waitForLoginResult(context);
      if (result === "success") {
        step("succeeded", "Session is already active and can be reused.");
        run.endedAt = new Date().toISOString();
        return run;
      }

      step("manual_handoff", "请在这个独立 Profile 中手动完成 Google、手机号、验证码、短信或 2FA 登录。");
      run.requiresManual = true;
      return run;
    }

    if (authMode === "flow_password") {
      if (!context.credentials.password) {
        return fail("missing_password", "This multi-step password flow requires an encrypted password.");
      }

      const flowPassword = context.credentials.password;
      step("filling_credentials", "正在执行配置好的多步骤账号密码登录流程。");
      const flowSteps = context.adapter.flowSteps ?? [];
      const waitForManualPasswordStep = async (locator: string): Promise<boolean> => {
        const manualContinueWaitMs = this.options.manualContinueWaitMs ?? 0;
        if (manualContinueWaitMs <= 0) {
          return false;
        }

        step("waiting_for_result", "检测到人工验证；验证完成后会继续等待密码框出现并自动填充。");
        return await this.waitForVisibleLocator(
          session,
          locator,
          manualContinueWaitMs,
          this.options.manualContinuePollMs ?? 500
        );
      };
      const finishDetectedResultUnlessStepCanContinue = async (
        result: LoginResult,
        nextStep: LoginFlowStep | undefined
      ): Promise<LoginRun | undefined> => {
        if (result === "manual" && nextStep) {
          if (await session.isVisible(nextStep.locator)) {
            return undefined;
          }

          if (nextStep.type === "fill_password") {
            if (await waitForManualPasswordStep(nextStep.locator)) {
              return undefined;
            }
          }
        }

        return finishDetectedResult(result);
      };
      const retryPasswordAfterManualStep = async (flowStep: LoginFlowStep): Promise<boolean> => {
        if (flowStep.type !== "fill_password") {
          return false;
        }

        const result = await session.detectLoginResult(context);
        if (result !== "manual") {
          return false;
        }

        if (!(await waitForManualPasswordStep(flowStep.locator))) {
          return false;
        }

        try {
          await this.fill(session, flowStep.locator, flowPassword);
          step("filling_credentials", "已填写密码字段。");
          return true;
        } catch {
          return false;
        }
      };
      const handleFlowStepError = async (flowStep: LoginFlowStep): Promise<LoginRun> => {
        const detectedResult = finishDetectedResult(await session.detectLoginResult(context));
        if (detectedResult) {
          return detectedResult;
        }

        if (flowStep.type === "fill_password") {
          step(
            "manual_handoff",
            "未找到 Google 密码输入框；当前页面可能需要身份验证、账号恢复、人工确认，或网站登录页已变化。请在独立浏览器窗口手动处理。"
          );
          run.requiresManual = true;
          return run;
        }

        return fail("flow_step_unavailable", "登录流程中的页面元素未出现；请检查选择器配置，或在独立浏览器窗口手动处理。");
      };

      for (let index = 0; index < flowSteps.length; index += 1) {
        const flowStep = flowSteps[index];
        const stepUrl = await session.currentUrl();
        if (this.isConcreteUrl(stepUrl) && !originRules.isAllowedUrl(stepUrl)) {
          return fail("origin_not_allowed", "Login flow moved outside configured platform origins.");
        }

        const beforeStepResult = await finishDetectedResultUnlessStepCanContinue(
          await session.detectLoginResult(context),
          flowStep
        );
        if (beforeStepResult) {
          return beforeStepResult;
        }

        try {
          if (flowStep.type === "click") {
            await this.click(session, flowStep.locator);
            step("filling_credentials", "已点击登录流程按钮。");
          }

          if (flowStep.type === "fill_username") {
            await this.fill(session, flowStep.locator, context.credentials.username);
            step("filling_credentials", "已填写账号字段。");
          }

          if (flowStep.type === "fill_password") {
            await this.fill(session, flowStep.locator, flowPassword);
            step("filling_credentials", "已填写密码字段。");
          }
        } catch {
          if (!(await retryPasswordAfterManualStep(flowStep))) {
            return await handleFlowStepError(flowStep);
          }
        }

        const afterStepResult = await finishDetectedResultUnlessStepCanContinue(
          await session.detectLoginResult(context),
          flowSteps[index + 1]
        );
        if (afterStepResult) {
          return afterStepResult;
        }
      }

      step("waiting_for_result", "正在等待登录结果，或验证码、短信、2FA、手机号/扫码等手动接管条件。");
      const result = await session.waitForLoginResult(context);

      if (result === "success") {
        step("succeeded", "Login completed and session profile can be reused.");
        run.endedAt = new Date().toISOString();
        return run;
      }

      if (result === "failure") {
        return fail("login_failed", "The site reported a login failure.");
      }

      step("manual_handoff", "当前页面需要验证码、短信、2FA、手机号/扫码或站点验证，已停止自动填充并交给你手动处理。");
      run.requiresManual = true;
      return run;
    }

    if (!context.credentials.password) {
      return fail("missing_password", "This password-login adapter requires an encrypted password.");
    }

    step("filling_credentials", "正在填写配置好的账号和密码字段。");
    await this.fill(session, context.adapter.usernameLocator, context.credentials.username);
    await this.fill(session, context.adapter.passwordLocator, context.credentials.password);
    await this.click(session, context.adapter.submitLocator);

    step("waiting_for_result", "正在等待登录结果或手动接管条件。");
    const result = await session.waitForLoginResult(context);

    if (result === "success") {
      step("succeeded", "Login completed and session profile can be reused.");
      run.endedAt = new Date().toISOString();
      return run;
    }

    if (result === "manual") {
      step("manual_handoff", "当前页面需要验证码、短信、2FA、手机号/扫码或站点验证，已停止自动填充并交给你手动处理。");
      run.requiresManual = true;
      return run;
    }

    if (result === "failure") {
      return fail("login_failed", "The site reported a login failure.");
    }

    return fail("login_result_unknown", "Unable to confirm the login result.");
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

  private isConcreteUrl(url: string): boolean {
    return url.length > 0 && !url.startsWith("about:");
  }

  private isStartupUrl(url: string): boolean {
    return (
      url.length === 0 ||
      url.startsWith("about:") ||
      url.startsWith("chrome://newtab") ||
      url.startsWith("chrome://new-tab-page") ||
      url.startsWith("chrome://welcome") ||
      url.startsWith("edge://newtab") ||
      url.startsWith("data:")
    );
  }

  private async fill(session: BrowserSession, locator: string, value: string): Promise<void> {
    await session.focusLocator?.(locator, 5_000);
    await session.fill(locator, value);
  }

  private async click(session: BrowserSession, locator: string): Promise<void> {
    await session.focusLocator?.(locator, 750);
    await session.click(locator);
  }

  private async waitForVisibleLocator(
    session: BrowserSession,
    locator: string,
    timeoutMs: number,
    pollMs: number
  ): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    const interval = Math.max(1, pollMs);
    while (Date.now() < deadline) {
      await this.sleep(interval);
      if (await session.isVisible(locator)) {
        return true;
      }
    }

    return false;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export class PlaywrightBrowserController implements BrowserController {
  constructor(private readonly options: { channel?: "chrome" | "msedge"; headless?: boolean } = {}) {}

  async openPersistentSession(profilePath: string): Promise<BrowserSession> {
    const { chromium } = await import("playwright");
    const context = await chromium.launchPersistentContext(profilePath, {
      channel: this.options.channel ?? "chrome",
      headless: this.options.headless ?? false,
      viewport: null
    });
    const page = context.pages()[0] ?? (await context.newPage());
    return new PlaywrightBrowserSession(page);
  }
}

export class PlaywrightBrowserSession implements BrowserSession {
  constructor(private page: Page, private readonly retainConnection?: unknown) {}

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async focusLocator(locator: string, timeoutMs = 2_000): Promise<void> {
    const page = await this.findPageWithVisibleLocator(locator, timeoutMs);
    if (page) {
      this.page = page;
    }
  }

  async fill(locator: string, value: string): Promise<void> {
    await this.page.locator(locator).first().fill(value, { timeout: 10_000 });
  }

  async click(locator: string): Promise<void> {
    await this.page.locator(locator).first().click({ timeout: 10_000 });
  }

  async isVisible(locator: string): Promise<boolean> {
    return Boolean(await this.findPageWithVisibleLocator(locator, 0));
  }

  async waitForLoginResult(context: LoginRunContext): Promise<LoginResult> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const result = await this.detectLoginResult(context);
      if (result !== "unknown") {
        return result;
      }
      await this.page.waitForTimeout(500);
    }

    return "unknown";
  }

  async detectLoginResult(context: LoginRunContext): Promise<LoginResult> {
    if (await this.matchesAny(context.adapter.manualRules)) {
      return "manual";
    }

    if (await this.matchesAny(context.adapter.failureRules)) {
      return "failure";
    }

    if (await this.matchesAny(context.adapter.successRules)) {
      return "success";
    }

    return "unknown";
  }

  private async matchesAny(rules: LoginRunContext["adapter"]["successRules"]): Promise<boolean> {
    for (const rule of rules) {
      if (rule.type === "url_contains" && this.page.url().includes(rule.value)) {
        return true;
      }

      if (rule.type === "url_regex" && new RegExp(rule.value).test(this.page.url())) {
        return true;
      }

      if (rule.type === "selector_visible") {
        if (await this.isVisible(rule.value)) {
          return true;
        }
      }
    }

    return false;
  }

  private async findPageWithVisibleLocator(locator: string, timeoutMs: number): Promise<Page | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      for (const candidate of this.openPages()) {
        const visible = await candidate.locator(locator).first().isVisible().catch(() => false);
        if (visible) {
          return candidate;
        }
      }

      if (Date.now() >= deadline) {
        return undefined;
      }

      await this.page.waitForTimeout(150).catch(() => undefined);
    }
  }

  private openPages(): Page[] {
    return this.page.context().pages().filter((page) => !page.isClosed());
  }
}
