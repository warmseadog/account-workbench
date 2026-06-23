import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CryptoVault } from "../src/main/crypto/vault";
import { ProfileManager } from "../src/main/profiles/profile-manager";
import { SqliteStore } from "../src/main/storage/sqlite-store";
import { WorkbenchService } from "../src/main/services/workbench-service";

function createService() {
  const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-"));
  const store = new SqliteStore(path.join(dir, "vault.sqlite"));
  const vault = CryptoVault.fromMasterPassword("local-master-password");
  const profiles = new ProfileManager(path.join(dir, "profiles"));

  return new WorkbenchService(store, vault, profiles);
}

describe("WorkbenchService", () => {
  it("stores account credentials encrypted and returns only safe account summaries", () => {
    const service = createService();
    const platform = service.createPlatform({
      name: "Example",
      baseUrl: "https://example.com",
      loginUrl: "https://example.com/login",
      allowedOrigins: ["https://example.com"]
    });

    const account = service.createAccount({
      platformId: platform.id,
      displayName: "运营账号",
      username: "owner@example.com",
      password: "secret-password",
      tags: ["owned"]
    });

    expect(JSON.stringify(account)).not.toContain("secret-password");
    expect(JSON.stringify(service.dumpRawAccountRow(account.id))).not.toContain("secret-password");
    expect(account.usernamePreview).toBe("o***@example.com");
    expect(account.hasPassword).toBe(true);
  });

  it("persists platform adapters with validated selectors", () => {
    const service = createService();
    const platform = service.createPlatform({
      name: "Example",
      baseUrl: "https://example.com",
      loginUrl: "https://example.com/login",
      allowedOrigins: ["https://example.com"]
    });

    const adapter = service.saveLoginAdapter({
      platformId: platform.id,
      authMode: "password",
      usernameLocator: "input[name=email]",
      passwordLocator: "input[name=password]",
      submitLocator: "button[type=submit]",
      successRules: [{ type: "selector_visible", value: "[data-user-menu]" }],
      failureRules: [{ type: "selector_visible", value: ".login-error" }],
      manualRules: [{ type: "selector_visible", value: ".captcha" }]
    });

    expect(adapter.platformId).toBe(platform.id);
    expect(adapter.authMode).toBe("password");
    expect(adapter.usernameLocator).toBe("input[name=email]");
    expect(service.listPlatforms()).toHaveLength(1);
  });

  it("creates Dola manual-session preset without requiring stored Google password", () => {
    const service = createService();

    const preset = service.createDolaPreset();
    const account = service.createAccount({
      platformId: preset.platform.id,
      displayName: "Dola Google 账号",
      username: "owner@gmail.com",
      tags: ["dola", "google"]
    });

    expect(preset.platform.loginUrl).toBe("https://www.dola.com/chat/?from_logout=1");
    expect(preset.platform.allowedOrigins).toEqual(["https://www.dola.com"]);
    expect(preset.adapter.authMode).toBe("manual_session");
    expect(account.hasPassword).toBe(false);
    expect(JSON.stringify(service.dumpRawAccountRow(account.id))).not.toContain("owner@gmail.com");
  });

  it("creates Dola Google preset as a normal Chrome password-fill flow", () => {
    const service = createService();

    const preset = service.createDolaGooglePasswordPreset();
    const account = service.createAccount({
      platformId: preset.platform.id,
      displayName: "Dola Google 自动填充",
      username: "owner@gmail.com",
      password: "google-password",
      tags: ["dola", "google"]
    });

    expect(preset.platform.allowedOrigins).toEqual(["https://www.dola.com", "https://accounts.google.com"]);
    expect(preset.adapter.authMode).toBe("flow_password");
    expect(preset.adapter.successRules).toEqual([]);
    expect(preset.adapter.flowSteps?.some((step) => step.type === "fill_username")).toBe(true);
    expect(preset.adapter.flowSteps?.some((step) => step.type === "fill_password")).toBe(true);
    expect(preset.adapter.manualRules).toContainEqual({
      type: "selector_visible",
      value: "input[placeholder='请输入手机号']"
    });
    expect(preset.adapter.manualRules).toContainEqual({
      type: "selector_visible",
      value: "input[placeholder='Phone number']"
    });
    expect(preset.adapter.manualRules).toContainEqual({
      type: "selector_visible",
      value: "text=Scan QR code with Dola App"
    });
    expect(preset.adapter.manualRules).toContainEqual({
      type: "selector_visible",
      value: "text=Verify it’s you"
    });
    expect(preset.adapter.failureRules).toContainEqual({
      type: "selector_visible",
      value: "text=Wrong password. Try again"
    });
    expect(account.hasPassword).toBe(true);
    expect(JSON.stringify(service.dumpRawAccountRow(account.id))).not.toContain("google-password");
  });

  it("imports Dola Google accounts from local credential files without storing plaintext", () => {
    const service = createService();
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-import-"));
    const filePath = path.join(dir, "accounts.txt");
    writeFileSync(
      filePath,
      [
        "owner1@gmail.com----password-one----CN----US----1----recovery-token",
        "owner2@gmail.com----password-two----extra-field",
        "invalid-without-email"
      ].join("\n"),
      "utf8"
    );

    const firstImport = service.importDolaGoogleAccountsFromFile({ filePath });
    const secondImport = service.importDolaGoogleAccountsFromFile({ filePath });
    const accounts = service.listAccounts(firstImport.platform.id);

    expect(firstImport.imported).toBe(2);
    expect(firstImport.skippedDuplicates).toBe(0);
    expect(firstImport.skippedInvalid).toBe(1);
    expect(secondImport.imported).toBe(0);
    expect(secondImport.skippedDuplicates).toBe(2);
    expect(accounts).toHaveLength(2);
    expect(service.getLoginAdapter(firstImport.platform.id)?.authMode).toBe("flow_password");
    expect(service.getAccountSecrets(accounts[0].id)).toEqual({
      username: "owner1@gmail.com",
      password: "password-one"
    });
    expect(JSON.stringify(service.dumpRawAccountRow(accounts[0].id))).not.toContain("password-one");
    expect(JSON.stringify(accounts)).not.toContain("owner1@gmail.com");
  });

  it("repairs imported duplicate Dola Google accounts that are missing passwords", () => {
    const service = createService();
    const preset = service.createDolaGooglePasswordPreset();
    const account = service.createAccount({
      platformId: preset.platform.id,
      displayName: "Dola Google 旧账号",
      username: "owner1@gmail.com",
      tags: ["dola", "google"]
    });
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-import-repair-"));
    const filePath = path.join(dir, "accounts.txt");
    writeFileSync(filePath, "owner1@gmail.com----password-one", "utf8");

    const result = service.importDolaGoogleAccountsFromFile({ filePath });

    expect(result.imported).toBe(0);
    expect(result.skippedDuplicates).toBe(1);
    expect(service.getAccountSecrets(account.id)).toEqual({
      username: "owner1@gmail.com",
      password: "password-one"
    });
  });

  it("migrates old Dola Google manual-session adapters to password-fill flow when read", () => {
    const service = createService();
    const platform = service.createPlatform({
      name: "Dola Google 手动会话",
      baseUrl: "https://www.dola.com/chat/",
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"]
    });
    service.saveLoginAdapter({
      platformId: platform.id,
      authMode: "manual_session",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      successRules: [],
      failureRules: [],
      manualRules: []
    });

    const adapter = service.getLoginAdapter(platform.id);

    expect(adapter?.authMode).toBe("flow_password");
    expect(adapter?.flowSteps?.some((step) => step.type === "fill_password")).toBe(true);
  });
});
