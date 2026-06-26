import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CryptoVault } from "../src/main/crypto/vault";
import { ProfileManager } from "../src/main/profiles/profile-manager";
import { SqliteStore } from "../src/main/storage/sqlite-store";
import { WorkbenchService } from "../src/main/services/workbench-service";

function writeNestedFile(filePath: string, value: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

function createService(options: { templatePath?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-"));
  const store = new SqliteStore(path.join(dir, "vault.sqlite"));
  const vault = CryptoVault.fromMasterPassword("local-master-password");
  const profiles = new ProfileManager(path.join(dir, "profiles"), options.templatePath);

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

  it("deletes a platform and its account records", () => {
    const service = createService();
    const platform = service.createPlatform({
      name: "Example",
      baseUrl: "https://example.com",
      loginUrl: "https://example.com/login",
      allowedOrigins: ["https://example.com"]
    });
    service.createAccount({
      platformId: platform.id,
      displayName: "运营账号",
      username: "owner@example.com",
      password: "secret-password"
    });

    service.deletePlatform(platform.id);

    expect(service.listPlatforms()).toHaveLength(0);
    expect(service.listAccounts(platform.id)).toHaveLength(0);
  });

  it("resets an account browser profile from the prepared template", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-template-"));
    const templatePath = path.join(dir, "profile-template", "user-data");
    writeNestedFile(path.join(templatePath, "Default", "Extensions", "extension-a", "manifest.json"), "{}");
    const service = createService({ templatePath });
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
      password: "secret-password"
    });
    const profilePath = service.getProfilePath(account.id);
    writeNestedFile(path.join(profilePath, "Default", "Bookmarks"), "existing-profile");

    const result = service.resetAccountProfileFromTemplate(account.id);

    expect(result.profilePath).toBe(profilePath);
    expect(existsSync(path.join(profilePath, "Default", "Bookmarks"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Extensions", "extension-a", "manifest.json"))).toBe(true);
  });

  it("automatically applies template extensions before returning an account profile path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-template-"));
    const templatePath = path.join(dir, "profile-template", "user-data");
    writeNestedFile(path.join(templatePath, "Default", "Extensions", "extension-a", "1.0.0_0", "manifest.json"), "{}");
    const service = createService({ templatePath });
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
      password: "secret-password"
    });
    const profilePath = service.getProfilePath(account.id);
    rmSync(path.join(profilePath, "Default", "Extensions"), { recursive: true, force: true });
    writeNestedFile(path.join(profilePath, "Default", "Bookmarks"), "profile-without-template-extension");

    service.getProfilePath(account.id);

    expect(existsSync(path.join(profilePath, "Default", "Bookmarks"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Extensions", "extension-a", "1.0.0_0", "manifest.json"))).toBe(true);
  });

  it("preconfigures camera access for platform and Google verification origins", () => {
    const service = createService();
    const platform = service.createPlatform({
      name: "Example",
      baseUrl: "https://example.com",
      loginUrl: "https://example.com/login",
      allowedOrigins: ["https://example.com", "https://accounts.google.com"]
    });
    const account = service.createAccount({
      platformId: platform.id,
      displayName: "运营账号",
      username: "owner@example.com",
      password: "secret-password"
    });

    const profilePath = service.getProfilePath(account.id);

    const preferences = JSON.parse(readFileSync(path.join(profilePath, "Default", "Preferences"), "utf8"));
    expect(preferences.profile.content_settings.exceptions.media_stream_camera).toMatchObject({
      "https://example.com,*": { setting: 1 },
      "https://accounts.google.com,*": { setting: 1 },
      "https://www.google.com,*": { setting: 1 }
    });
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

  it("ensures the default Dola Google preset without creating duplicates", () => {
    const service = createService();

    const first = service.ensureDefaultDolaGooglePreset();
    const second = service.ensureDefaultDolaGooglePreset();

    expect(first.platform.id).toBe(second.platform.id);
    expect(first.platform.loginUrl).toBe("https://www.dola.com/chat/?from_logout=1");
    expect(first.platform.allowedOrigins).toEqual(["https://www.dola.com", "https://accounts.google.com"]);
    expect(second.adapter.authMode).toBe("flow_password");
    expect(service.listPlatforms()).toHaveLength(1);
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

  it("imports 91kami-style credential metadata for local display", () => {
    const service = createService();
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-import-meta-"));
    const filePath = path.join(dir, "accounts.txt");
    writeFileSync(
      filePath,
      [
        "owner1@gmail.com----password-one----short-code",
        "copy",
        "totp-secret-value----United States----2020"
      ].join("\n"),
      "utf8"
    );

    const result = service.importDolaGoogleAccountsFromFile({ filePath });
    const [account] = service.listAccounts(result.platform.id);
    const detail = service.getAccountDetail(account.id);

    expect(result.imported).toBe(1);
    expect(result.skippedInvalid).toBe(0);
    expect(detail.username).toBe("owner1@gmail.com");
    expect(detail.password).toBe("password-one");
    expect(detail.secretMeta).toEqual({
      extraCode: "short-code",
      verificationSecret: "totp-secret-value",
      region: "United States",
      year: "2020"
    });
    expect(service.getAccountSecrets(account.id)).toEqual({
      username: "owner1@gmail.com",
      password: "password-one",
      verificationSecret: "totp-secret-value"
    });
    expect(JSON.stringify(service.dumpRawAccountRow(account.id))).not.toContain("totp-secret-value");
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
