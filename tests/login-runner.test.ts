import { describe, expect, it } from "vitest";
import { LoginRunner, type BrowserController, type BrowserSession } from "../src/main/runs/login-runner";
import type { LoginRunContext } from "../src/main/runs/login-runner";

class FakeSession implements BrowserSession {
  filled: Array<{ locator: string; value: string }> = [];
  clicked: string[] = [];
  focusedLocators: string[] = [];
  focusTimeouts: Array<number | undefined> = [];
  manualAfterLoginClick = false;
  requireFocusBeforeFill = false;
  private readonly revealAfterVisibilityChecks = new Map<string, number>();
  private readonly revealOnFillError = new Map<string, string[]>();
  private readonly throwOnceOnFillLocators = new Set<string>();
  private readonly visibilityChecks = new Map<string, number>();

  constructor(
    private current: string,
    private readonly result: "success" | "failure" | "manual" | "unknown",
    private readonly visibleLocators = new Set<string>(),
    private readonly revealOnClick = new Map<string, string[]>(),
    private readonly throwOnFillLocators = new Set<string>()
  ) {}

  async currentUrl(): Promise<string> {
    return this.current;
  }

  async goto(url: string): Promise<void> {
    this.current = url;
  }

  async focusLocator(locator: string, timeoutMs?: number): Promise<void> {
    this.focusedLocators.push(locator);
    this.focusTimeouts.push(timeoutMs);
  }

  async fill(locator: string, value: string): Promise<void> {
    if (this.throwOnceOnFillLocators.has(locator)) {
      this.throwOnceOnFillLocators.delete(locator);
      for (const visibleLocator of this.revealOnFillError.get(locator) ?? []) {
        this.visibleLocators.add(visibleLocator);
      }
      throw new Error(`Locator not ready yet: ${locator}`);
    }
    if (this.throwOnFillLocators.has(locator)) {
      for (const visibleLocator of this.revealOnFillError.get(locator) ?? []) {
        this.visibleLocators.add(visibleLocator);
      }
      throw new Error(`Locator not found: ${locator}`);
    }
    if (this.requireFocusBeforeFill && !this.focusedLocators.includes(locator)) {
      throw new Error(`Locator is on a different page: ${locator}`);
    }
    this.filled.push({ locator, value });
  }

  async click(locator: string): Promise<void> {
    this.clicked.push(locator);
    for (const visibleLocator of this.revealOnClick.get(locator) ?? []) {
      this.visibleLocators.add(visibleLocator);
    }
    if (locator === "button:has-text('登录')") {
      this.manualAfterLoginClick = true;
    }
    if (locator === "button:has-text('Google')" && this.manualAfterLoginClick && !this.visibleLocators.has(locator)) {
      throw new Error("Google login option is not visible on the current Dola login panel.");
    }
    if (locator === "button:has-text('Google')") {
      this.current = "https://accounts.google.com/v3/signin/identifier";
    }
  }

  revealLocatorAfterVisibilityChecks(locator: string, checks: number): void {
    this.revealAfterVisibilityChecks.set(locator, checks);
  }

  throwOnceAndRevealOnFill(locator: string, visibleLocators: string[]): void {
    this.throwOnceOnFillLocators.add(locator);
    this.revealOnFillError.set(locator, visibleLocators);
  }

  async isVisible(locator: string): Promise<boolean> {
    if (!this.visibleLocators.has(locator)) {
      const checks = (this.visibilityChecks.get(locator) ?? 0) + 1;
      this.visibilityChecks.set(locator, checks);
      const revealAfterChecks = this.revealAfterVisibilityChecks.get(locator);
      if (revealAfterChecks !== undefined && checks >= revealAfterChecks) {
        this.visibleLocators.add(locator);
      }
    }

    return this.visibleLocators.has(locator);
  }

  async detectLoginResult(context?: LoginRunContext): Promise<"success" | "failure" | "manual" | "unknown"> {
    if (context?.adapter.manualRules.some((rule) => this.visibleLocators.has(rule.value))) {
      return "manual";
    }

    if (context?.adapter.failureRules.some((rule) => this.visibleLocators.has(rule.value))) {
      return "failure";
    }

    return this.manualAfterLoginClick ? "manual" : "unknown";
  }

  async waitForLoginResult(): Promise<"success" | "failure" | "manual" | "unknown"> {
    return this.result;
  }
}

class FakeBrowserController implements BrowserController {
  openedProfilePath?: string;
  readonly session: FakeSession;

  constructor(
    currentUrl: string,
    result: "success" | "failure" | "manual" | "unknown",
    visibleLocators = new Set<string>(),
    revealOnClick = new Map<string, string[]>(),
    throwOnFillLocators = new Set<string>()
  ) {
    this.session = new FakeSession(currentUrl, result, visibleLocators, revealOnClick, throwOnFillLocators);
  }

  async openPersistentSession(profilePath: string): Promise<BrowserSession> {
    this.openedProfilePath = profilePath;
    return this.session;
  }
}

class ThrowingBrowserController implements BrowserController {
  async openPersistentSession(): Promise<BrowserSession> {
    throw new Error("Profile is already in use");
  }
}

function context(): LoginRunContext {
  return {
    accountId: "account-1",
    profilePath: "/tmp/profiles/account-1",
    platform: {
      id: "platform-1",
      name: "Example",
      baseUrl: "https://example.com",
      loginUrl: "https://example.com/login",
      allowedOrigins: ["https://example.com"],
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    },
    adapter: {
      id: "adapter-1",
      platformId: "platform-1",
      authMode: "password",
      usernameLocator: "input[name=email]",
      passwordLocator: "input[name=password]",
      submitLocator: "button[type=submit]",
      successRules: [],
      failureRules: [],
      manualRules: [],
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    },
    credentials: {
      username: "owner@example.com",
      password: "secret-password"
    }
  };
}

describe("LoginRunner", () => {
  it("does not fill credentials when the browser is on an unapproved origin", async () => {
    const browser = new FakeBrowserController("https://evil.example.net/login", "unknown");
    const runner = new LoginRunner(browser);

    const run = await runner.run(context());

    expect(run.status).toBe("failed");
    expect(run.errorCode).toBe("origin_not_allowed");
    expect(browser.session.filled).toHaveLength(0);
  });

  it("reports a clear failure when the profile browser cannot be opened", async () => {
    const runner = new LoginRunner(new ThrowingBrowserController());

    const run = await runner.run(context());

    expect(run.status).toBe("failed");
    expect(run.errorCode).toBe("browser_profile_unavailable");
    expect(JSON.stringify(run.steps)).not.toContain("secret-password");
  });

  it("treats Chrome startup pages as blank and navigates to the configured login URL", async () => {
    const browser = new FakeBrowserController("chrome://newtab/", "manual");
    const runner = new LoginRunner(browser);

    const run = await runner.run(context());

    expect(run.status).toBe("manual_handoff");
    expect(browser.session.filled).toHaveLength(2);
    expect(await browser.session.currentUrl()).toBe("https://example.com/login");
  });

  it("moves captcha or 2FA-like states into manual handoff", async () => {
    const browser = new FakeBrowserController("https://example.com/login", "manual");
    const runner = new LoginRunner(browser);

    const run = await runner.run(context());

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(browser.session.filled).toHaveLength(2);
  });

  it("redacts secrets from run steps", async () => {
    const browser = new FakeBrowserController("https://example.com/login", "success");
    const runner = new LoginRunner(browser);

    const run = await runner.run(context());

    expect(run.status).toBe("succeeded");
    expect(JSON.stringify(run.steps)).not.toContain("secret-password");
    expect(JSON.stringify(run.steps)).not.toContain("owner@example.com");
  });

  it("opens manual-session adapters without filling Google credentials", async () => {
    const browser = new FakeBrowserController("about:blank", "unknown");
    const runner = new LoginRunner(browser);
    const input = context();
    input.adapter = {
      ...input.adapter,
      authMode: "manual_session",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: ""
    };
    input.credentials = {
      username: "owner@gmail.com"
    };
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com"]
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(browser.session.filled).toHaveLength(0);
    expect(browser.session.clicked).toHaveLength(0);
  });

  it("runs a multi-step Google password flow without logging credentials", async () => {
    const browser = new FakeBrowserController("about:blank", "manual");
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[type=email]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[type=password]" },
        { type: "click", locator: "#passwordNext" }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(browser.session.filled).toEqual([
      { locator: "input[type=email]", value: "owner@gmail.com" },
      { locator: "input[type=password]", value: "google-password" }
    ]);
    expect(JSON.stringify(run.steps)).not.toContain("owner@gmail.com");
    expect(JSON.stringify(run.steps)).not.toContain("google-password");
  });

  it("focuses the OAuth page before filling the Google username field", async () => {
    const browser = new FakeBrowserController(
      "about:blank",
      "manual",
      new Set(["button:has-text('Google')", "input[type=email]", "input[type=password]"])
    );
    browser.session.requireFocusBeforeFill = true;
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[type=email]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[type=password]" }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(browser.session.focusedLocators).toContain("input[type=email]");
    expect(browser.session.focusTimeouts).toContain(5_000);
    expect(browser.session.filled).toContainEqual({ locator: "input[type=email]", value: "owner@gmail.com" });
  });

  it("records redacted progress after filling username, password, and clicking confirm", async () => {
    const browser = new FakeBrowserController(
      "about:blank",
      "success",
      new Set(["button:has-text('Google')", "input[type=email]", "input[type=password]"])
    );
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[type=email]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[type=password]" },
        { type: "click", locator: "#passwordNext" }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);
    const messages = run.steps.map((item) => item.message);

    expect(messages).toContain("已填写账号字段。");
    expect(messages).toContain("已点击登录流程按钮。");
    expect(messages).toContain("已填写密码字段。");
    expect(JSON.stringify(run.steps)).not.toContain("owner@gmail.com");
    expect(JSON.stringify(run.steps)).not.toContain("google-password");
  });

  it("continues filling the password after manual verification reveals the password field later", async () => {
    const verificationRule = "text=需要完成验证";
    const browser = new FakeBrowserController(
      "about:blank",
      "manual",
      new Set(["button:has-text('Google')", "input[type=email]"]),
      new Map([["#identifierNext", [verificationRule]]])
    );
    browser.session.revealLocatorAfterVisibilityChecks("input[type=password]", 2);
    const runner = new LoginRunner(browser, { manualContinueWaitMs: 50, manualContinuePollMs: 1 });
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[type=email]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[type=password]" }
      ],
      manualRules: [
        { type: "selector_visible", value: verificationRule }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(browser.session.filled).toContainEqual({ locator: "input[type=password]", value: "google-password" });
    expect(run.steps.map((item) => item.message)).toContain("已填写密码字段。");
  });

  it("retries filling the password when verification appears after the first password fill attempt", async () => {
    const verificationRule = "text=需要完成验证";
    const browser = new FakeBrowserController(
      "about:blank",
      "manual",
      new Set(["button:has-text('Google')", "input[type=email]"])
    );
    browser.session.throwOnceAndRevealOnFill("input[type=password]", [verificationRule]);
    browser.session.revealLocatorAfterVisibilityChecks("input[type=password]", 2);
    const runner = new LoginRunner(browser, { manualContinueWaitMs: 50, manualContinuePollMs: 1 });
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[type=email]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[type=password]" }
      ],
      manualRules: [
        { type: "selector_visible", value: verificationRule }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(browser.session.filled).toContainEqual({ locator: "input[type=password]", value: "google-password" });
    expect(run.steps.map((item) => item.message)).toContain("检测到人工验证；验证完成后会继续等待密码框出现并自动填充。");
    expect(run.steps.map((item) => item.message)).toContain("已填写密码字段。");
  });

  it("describes unsafe browser blocks as manual handoff instead of a password failure", async () => {
    const unsafeBrowserRule = "text=This browser or app may not be secure";
    const browser = new FakeBrowserController(
      "about:blank",
      "unknown",
      new Set(["button:has-text('Google')"]),
      new Map([["button:has-text('Google')", [unsafeBrowserRule]]])
    );
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[name=identifier]" },
        { type: "fill_password", locator: "input[name=Passwd]" }
      ],
      manualRules: [
        { type: "selector_visible", value: unsafeBrowserRule }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(run.steps.at(-1)?.message).toContain("不安全浏览器");
    expect(browser.session.filled).toHaveLength(0);
  });

  it("hands off instead of timing out when Dola only exposes phone login after clicking login", async () => {
    const browser = new FakeBrowserController("about:blank", "unknown");
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('登录')" },
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[type=email]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[type=password]" },
        { type: "click", locator: "#passwordNext" }
      ],
      manualRules: [
        { type: "selector_visible", value: "input[placeholder='请输入手机号']" }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(browser.session.clicked).toEqual(["button:has-text('登录')"]);
    expect(browser.session.filled).toHaveLength(0);
  });

  it("clicks Google when the Dola phone login panel also exposes the Google option", async () => {
    const browser = new FakeBrowserController(
      "about:blank",
      "manual",
      new Set(["button:has-text('Google')", "input[type=email]", "input[type=password]"])
    );
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('登录')" },
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[type=email]" },
        { type: "fill_password", locator: "input[type=password]" }
      ],
      manualRules: [
        { type: "selector_visible", value: "input[placeholder='请输入手机号']" }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(browser.session.clicked).toEqual(["button:has-text('登录')", "button:has-text('Google')"]);
    expect(browser.session.filled).toEqual([
      { locator: "input[type=email]", value: "owner@gmail.com" },
      { locator: "input[type=password]", value: "google-password" }
    ]);
  });

  it("stops before password fill when Google reports an account failure after email next", async () => {
    const googleAccountFailure = "text=Couldn’t find your Google Account";
    const browser = new FakeBrowserController(
      "about:blank",
      "unknown",
      new Set(["button:has-text('Google')"]),
      new Map([["#identifierNext", [googleAccountFailure]]])
    );
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[name=identifier]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[name=Passwd]" }
      ],
      failureRules: [
        { type: "selector_visible", value: googleAccountFailure }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("failed");
    expect(run.errorCode).toBe("login_failed");
    expect(browser.session.filled).toEqual([
      { locator: "input[name=identifier]", value: "owner@gmail.com" }
    ]);
  });

  it("hands off cleanly when the expected password field never appears", async () => {
    const browser = new FakeBrowserController(
      "about:blank",
      "unknown",
      new Set(["button:has-text('Google')"]),
      new Map(),
      new Set(["input[name=Passwd]"])
    );
    const runner = new LoginRunner(browser);
    const input = context();
    input.platform = {
      ...input.platform,
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    };
    input.adapter = {
      ...input.adapter,
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: [
        { type: "click", locator: "button:has-text('Google')" },
        { type: "fill_username", locator: "input[name=identifier]" },
        { type: "click", locator: "#identifierNext" },
        { type: "fill_password", locator: "input[name=Passwd]" }
      ]
    };
    input.credentials = {
      username: "owner@gmail.com",
      password: "google-password"
    };

    const run = await runner.run(input);

    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(JSON.stringify(run.steps)).not.toContain("google-password");
  });
});
