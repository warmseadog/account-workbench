import { describe, expect, it } from "vitest";
import { createAppRuntimeConfig, getDevMasterPassword } from "../src/main/app-runtime";

describe("app runtime config", () => {
  it("enables auto-unlock only for the local dev server", () => {
    expect(createAppRuntimeConfig({ VITE_DEV_SERVER_URL: "http://127.0.0.1:5173" })).toEqual({
      devAutoUnlock: true
    });
    expect(createAppRuntimeConfig({})).toEqual({
      devAutoUnlock: false
    });
  });

  it("uses the local development vault password with an environment override", () => {
    expect(getDevMasterPassword({})).toBe("12345678");
    expect(getDevMasterPassword({ ACCOUNT_WORKBENCH_DEV_MASTER_PASSWORD: "local-dev-only" })).toBe("local-dev-only");
  });
});
