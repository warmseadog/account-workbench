import { describe, expect, it } from "vitest";
import { LoginAdapterRules } from "../src/main/adapters/login-adapter";

describe("LoginAdapterRules", () => {
  it("only allows automation on configured origins", () => {
    const rules = new LoginAdapterRules({
      allowedOrigins: ["https://example.com", "https://accounts.example.com"]
    });

    expect(rules.isAllowedUrl("https://accounts.example.com/login")).toBe(true);
    expect(rules.isAllowedUrl("https://evil.example.net/login")).toBe(false);
  });

  it("rejects empty selectors before a login run starts", () => {
    expect(() =>
      LoginAdapterRules.validateSelectors({
        authMode: "password",
        usernameLocator: "",
        passwordLocator: "input[type=password]",
        submitLocator: "button[type=submit]"
      })
    ).toThrow(/username/i);
  });

  it("allows manual session adapters without password field selectors", () => {
    expect(() =>
      LoginAdapterRules.validateSelectors({
        authMode: "manual_session",
        usernameLocator: "",
        passwordLocator: "",
        submitLocator: ""
      })
    ).not.toThrow();
  });

  it("requires username and password steps for flow password adapters", () => {
    expect(() =>
      LoginAdapterRules.validateSelectors({
        authMode: "flow_password",
        usernameLocator: "",
        passwordLocator: "",
        submitLocator: "",
        flowSteps: [
          { type: "click", locator: "button:has-text('登录')" },
          { type: "fill_username", locator: "input[type=email]" },
          { type: "fill_password", locator: "input[type=password]" }
        ]
      })
    ).not.toThrow();

    expect(() =>
      LoginAdapterRules.validateSelectors({
        authMode: "flow_password",
        usernameLocator: "",
        passwordLocator: "",
        submitLocator: "",
        flowSteps: [{ type: "fill_username", locator: "input[type=email]" }]
      })
    ).toThrow(/password step/i);
  });
});
