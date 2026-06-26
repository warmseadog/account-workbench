import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProfileManager } from "../src/main/profiles/profile-manager";

function writeNestedFile(filePath: string, value: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

describe("ProfileManager", () => {
  it("creates stable isolated profile paths per platform and account", () => {
    const manager = new ProfileManager("/tmp/account-workbench");

    const first = manager.getProfilePath("platform/a", "account:one");
    const second = manager.getProfilePath("platform/a", "account:two");
    const repeated = manager.getProfilePath("platform/a", "account:one");

    expect(first).toBe(repeated);
    expect(first).not.toBe(second);
    expect(first).toContain("platform-a");
    expect(first).toContain("account-one");
  });

  it("initializes an empty account profile from the configured template", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-profiles-"));
    const templatePath = path.join(dir, "profile-template", "user-data");
    const manager = new ProfileManager(path.join(dir, "profiles"), templatePath);
    writeNestedFile(path.join(templatePath, "Default", "Extensions", "extension-a", "manifest.json"), "{}");

    const profilePath = manager.ensureProfilePath("platform-a", "account-one");

    expect(readFileSync(path.join(profilePath, "Default", "Extensions", "extension-a", "manifest.json"), "utf8")).toBe("{}");
  });

  it("seeds the user template from a bundled template before creating account profiles", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-bundled-template-"));
    const userTemplatePath = path.join(dir, "user-data-template", "user-data");
    const bundledTemplatePath = path.join(dir, "resources", "profile-template", "user-data");
    const manager = new ProfileManager(path.join(dir, "profiles"), userTemplatePath, bundledTemplatePath);
    writeNestedFile(path.join(bundledTemplatePath, "Default", "Extensions", "extension-a", "1.0.0_0", "manifest.json"), "{}");

    const profilePath = manager.ensureProfilePath("platform-a", "account-one");

    expect(existsSync(path.join(userTemplatePath, "Default", "Extensions", "extension-a", "1.0.0_0", "manifest.json"))).toBe(true);
    expect(existsSync(path.join(profilePath, "Default", "Extensions", "extension-a", "1.0.0_0", "manifest.json"))).toBe(true);
  });

  it("does not overwrite an existing account profile with the template", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-profiles-"));
    const templatePath = path.join(dir, "profile-template", "user-data");
    const manager = new ProfileManager(path.join(dir, "profiles"), templatePath);
    writeNestedFile(path.join(templatePath, "Default", "Extensions", "extension-a", "manifest.json"), "{}");
    const profilePath = manager.ensureProfilePath("platform-a", "account-one");
    writeNestedFile(path.join(profilePath, "Default", "Bookmarks"), "existing-profile");

    manager.ensureProfilePath("platform-a", "account-one");

    expect(readFileSync(path.join(profilePath, "Default", "Bookmarks"), "utf8")).toBe("existing-profile");
  });

  it("automatically resets an existing profile when template extensions are missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-profiles-"));
    const templatePath = path.join(dir, "profile-template", "user-data");
    const manager = new ProfileManager(path.join(dir, "profiles"), templatePath);
    const profilePath = manager.getProfilePath("platform-a", "account-one");
    writeNestedFile(path.join(templatePath, "Default", "Extensions", "extension-a", "1.0.0_0", "manifest.json"), "{}");
    writeNestedFile(path.join(profilePath, "Default", "Bookmarks"), "old-profile-without-extension");

    manager.ensureProfilePath("platform-a", "account-one");

    expect(existsSync(path.join(profilePath, "Default", "Bookmarks"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Extensions", "extension-a", "1.0.0_0", "manifest.json"))).toBe(true);
  });

  it("grants camera access to configured browser origins", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-profiles-"));
    const manager = new ProfileManager(path.join(dir, "profiles"));

    const profilePath = manager.ensureProfilePath("platform-a", "account-one", [
      "https://www.dola.com",
      "https://accounts.google.com"
    ]);

    const preferences = JSON.parse(readFileSync(path.join(profilePath, "Default", "Preferences"), "utf8"));
    expect(preferences.profile.content_settings.exceptions.media_stream_camera).toMatchObject({
      "https://www.dola.com,*": { setting: 1 },
      "https://accounts.google.com,*": { setting: 1 },
      "https://www.google.com,*": { setting: 1 }
    });
  });

  it("removes volatile browser state after copying the template profile", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-profiles-"));
    const templatePath = path.join(dir, "profile-template", "user-data");
    const manager = new ProfileManager(path.join(dir, "profiles"), templatePath);
    writeNestedFile(path.join(templatePath, "SingletonLock"), "locked");
    writeNestedFile(path.join(templatePath, "Default", "Network", "Cookies"), "site-cookies");
    writeNestedFile(path.join(templatePath, "Default", "Code Cache", "cache-file"), "cache");
    writeNestedFile(path.join(templatePath, "Default", "Extensions", "extension-a", "manifest.json"), "{}");

    const profilePath = manager.ensureProfilePath("platform-a", "account-one");

    expect(existsSync(path.join(profilePath, "SingletonLock"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Network", "Cookies"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Code Cache"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Extensions", "extension-a", "manifest.json"))).toBe(true);
  });

  it("resets an existing account profile from the configured template", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-profiles-"));
    const templatePath = path.join(dir, "profile-template", "user-data");
    const manager = new ProfileManager(path.join(dir, "profiles"), templatePath);
    writeNestedFile(path.join(templatePath, "Default", "Extensions", "extension-a", "manifest.json"), "{}");
    const profilePath = manager.ensureProfilePath("platform-a", "account-one");
    writeNestedFile(path.join(profilePath, "Default", "Bookmarks"), "existing-profile");
    writeNestedFile(path.join(profilePath, "Default", "Network", "Cookies"), "existing-cookies");

    const resetPath = manager.resetProfilePath("platform-a", "account-one");

    expect(resetPath).toBe(profilePath);
    expect(existsSync(path.join(profilePath, "Default", "Bookmarks"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Network", "Cookies"))).toBe(false);
    expect(existsSync(path.join(profilePath, "Default", "Extensions", "extension-a", "manifest.json"))).toBe(true);
  });

  it("reports a clear error when resetting without a prepared template profile", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-profiles-"));
    const manager = new ProfileManager(path.join(dir, "profiles"), path.join(dir, "profile-template", "user-data"));

    expect(() => manager.resetProfilePath("platform-a", "account-one")).toThrow("浏览器模板为空");
  });
});
