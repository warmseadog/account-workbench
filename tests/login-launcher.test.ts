import { describe, expect, it } from "vitest";
import { selectLoginLaunchMode } from "../src/main/runs/login-launcher";
import type { LoginAdapter, Platform } from "../src/shared/models";

function platform(allowedOrigins: string[]): Platform {
  return {
    id: "platform-1",
    name: "Example",
    baseUrl: allowedOrigins[0],
    loginUrl: `${allowedOrigins[0]}/login`,
    allowedOrigins,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

function adapter(authMode: LoginAdapter["authMode"]): LoginAdapter {
  return {
    id: "adapter-1",
    platformId: "platform-1",
    authMode,
    usernameLocator: "input[name=email]",
    passwordLocator: "input[name=password]",
    submitLocator: "button[type=submit]",
    successRules: [],
    failureRules: [],
    manualRules: [],
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

describe("login launcher routing", () => {
  it("uses normal Chrome autofill for Google password flows", () => {
    expect(selectLoginLaunchMode(platform(["https://example.com"]), adapter("manual_session"))).toBe("manual_session");
    expect(
      selectLoginLaunchMode(
        platform(["https://www.dola.com", "https://accounts.google.com"]),
        adapter("flow_password")
      )
    ).toBe("normal_chrome_flow");
    expect(selectLoginLaunchMode(platform(["https://example.com"]), adapter("password"))).toBe("playwright_flow");
  });
});
