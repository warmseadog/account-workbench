import type { LoginAuthMode, LoginFlowStep } from "../../shared/models.js";

export interface LoginAdapterRulesInput {
  allowedOrigins: string[];
}

export interface LoginSelectorInput {
  authMode?: LoginAuthMode;
  usernameLocator: string;
  passwordLocator: string;
  submitLocator: string;
  flowSteps?: LoginFlowStep[];
}

export class LoginAdapterRules {
  private readonly allowedOrigins: Set<string>;

  constructor(input: LoginAdapterRulesInput) {
    if (input.allowedOrigins.length === 0) {
      throw new Error("At least one allowed origin is required.");
    }

    this.allowedOrigins = new Set(input.allowedOrigins.map((origin) => this.normalizeOrigin(origin)));
  }

  isAllowedUrl(url: string): boolean {
    try {
      return this.allowedOrigins.has(new URL(url).origin);
    } catch {
      return false;
    }
  }

  static validateSelectors(selectors: LoginSelectorInput): void {
    const authMode = selectors.authMode ?? "password";
    if (authMode === "manual_session") {
      return;
    }

    if (authMode === "flow_password") {
      this.validateFlowSteps(selectors.flowSteps ?? []);
      return;
    }

    const required: Array<[keyof Pick<LoginSelectorInput, "usernameLocator" | "passwordLocator" | "submitLocator">, string]> = [
      ["usernameLocator", "username selector"],
      ["passwordLocator", "password selector"],
      ["submitLocator", "submit button selector"]
    ];

    for (const [field, label] of required) {
      if (selectors[field].trim().length === 0) {
        throw new Error(`${label} is required.`);
      }
    }
  }

  private static validateFlowSteps(flowSteps: LoginFlowStep[]): void {
    if (flowSteps.length === 0) {
      throw new Error("Flow password adapter requires login steps.");
    }

    if (!flowSteps.some((step) => step.type === "fill_username")) {
      throw new Error("Flow password adapter requires a username step.");
    }

    if (!flowSteps.some((step) => step.type === "fill_password")) {
      throw new Error("Flow password adapter requires a password step.");
    }

    for (const step of flowSteps) {
      if (step.locator.trim().length === 0) {
        throw new Error(`Flow ${step.type} step requires a selector.`);
      }
    }
  }

  private normalizeOrigin(originOrUrl: string): string {
    try {
      return new URL(originOrUrl).origin;
    } catch {
      throw new Error(`Invalid allowed origin: ${originOrUrl}`);
    }
  }
}
