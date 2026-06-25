import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_CAMERA_ORIGINS = ["https://accounts.google.com", "https://www.google.com"];

export class ProfileManager {
  constructor(
    private readonly profilesRoot: string,
    private readonly profileTemplatePath?: string
  ) {}

  getProfilePath(platformId: string, accountId: string): string {
    return path.join(
      this.profilesRoot,
      this.slug(platformId),
      this.slug(accountId),
      "user-data"
    );
  }

  ensureProfilePath(platformId: string, accountId: string, cameraOrigins: string[] = []): string {
    const profilePath = this.getProfilePath(platformId, accountId);
    this.ensureInitializedProfile(profilePath);
    this.resetProfileIfTemplateExtensionsAreMissing(profilePath);
    this.grantCameraAccess(profilePath, cameraOrigins);
    return profilePath;
  }

  resetProfilePath(platformId: string, accountId: string, cameraOrigins: string[] = []): string {
    const profilePath = this.getProfilePath(platformId, accountId);
    this.copyTemplateToProfile(profilePath);
    this.grantCameraAccess(profilePath, cameraOrigins);
    return profilePath;
  }

  private ensureInitializedProfile(profilePath: string): void {
    if (this.isNonEmptyDirectory(profilePath)) {
      return;
    }

    if (!this.profileTemplatePath || !this.isNonEmptyDirectory(this.profileTemplatePath)) {
      mkdirSync(profilePath, { recursive: true });
      return;
    }

    this.copyTemplateToProfile(profilePath);
  }

  private copyTemplateToProfile(profilePath: string): void {
    if (!this.profileTemplatePath || !this.isNonEmptyDirectory(this.profileTemplatePath)) {
      throw new Error("浏览器模板为空；请先打开模板浏览器并安装扩展或完成基础设置。");
    }

    mkdirSync(path.dirname(profilePath), { recursive: true });
    if (existsSync(profilePath)) {
      rmSync(profilePath, { recursive: true, force: true });
    }

    cpSync(this.profileTemplatePath, profilePath, { recursive: true });
    this.removeVolatileBrowserState(profilePath);
  }

  private resetProfileIfTemplateExtensionsAreMissing(profilePath: string): void {
    if (!this.profileTemplatePath || !this.isNonEmptyDirectory(profilePath)) {
      return;
    }

    const templateExtensionIds = this.getInstalledExtensionIds(this.profileTemplatePath);
    if (templateExtensionIds.length === 0) {
      return;
    }

    const profileExtensionIds = new Set(this.getInstalledExtensionIds(profilePath));
    if (templateExtensionIds.some((extensionId) => !profileExtensionIds.has(extensionId))) {
      this.copyTemplateToProfile(profilePath);
    }
  }

  private getInstalledExtensionIds(profilePath: string): string[] {
    const extensionsRoot = path.join(profilePath, "Default", "Extensions");
    try {
      return readdirSync(extensionsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "Temp")
        .map((entry) => entry.name)
        .filter((extensionId) => this.hasExtensionManifest(path.join(extensionsRoot, extensionId)));
    } catch {
      return [];
    }
  }

  private hasExtensionManifest(extensionPath: string): boolean {
    try {
      return readdirSync(extensionPath, { withFileTypes: true }).some((entry) => {
        return entry.isDirectory() && existsSync(path.join(extensionPath, entry.name, "manifest.json"));
      });
    } catch {
      return false;
    }
  }

  private grantCameraAccess(profilePath: string, cameraOrigins: string[]): void {
    const originPatterns = this.toChromeOriginPatterns([...DEFAULT_CAMERA_ORIGINS, ...cameraOrigins]);
    if (originPatterns.length === 0) {
      return;
    }

    const preferencesPath = path.join(profilePath, "Default", "Preferences");
    const preferences = this.readPreferences(preferencesPath);
    const profilePreferences = this.ensureRecord(preferences, "profile");
    const contentSettings = this.ensureRecord(profilePreferences, "content_settings");
    const exceptions = this.ensureRecord(contentSettings, "exceptions");
    const cameraExceptions = this.ensureRecord(exceptions, "media_stream_camera");
    const now = Date.now().toString();

    for (const originPattern of originPatterns) {
      cameraExceptions[originPattern] = {
        last_modified: now,
        setting: 1
      };
    }

    mkdirSync(path.dirname(preferencesPath), { recursive: true });
    writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2), "utf8");
  }

  private readPreferences(preferencesPath: string): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(preferencesPath, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = parent[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    const next: Record<string, unknown> = {};
    parent[key] = next;
    return next;
  }

  private toChromeOriginPatterns(origins: string[]): string[] {
    return Array.from(
      new Set(
        origins
          .map((originOrUrl) => {
            try {
              return `${new URL(originOrUrl).origin},*`;
            } catch {
              return undefined;
            }
          })
          .filter((originPattern): originPattern is string => Boolean(originPattern))
      )
    );
  }

  private isNonEmptyDirectory(directoryPath: string): boolean {
    try {
      return existsSync(directoryPath) && readdirSync(directoryPath).length > 0;
    } catch {
      return false;
    }
  }

  private removeVolatileBrowserState(profilePath: string): void {
    const volatilePaths = [
      "SingletonCookie",
      "SingletonLock",
      "SingletonSocket",
      "DevToolsActivePort",
      "BrowserMetrics",
      "Crashpad",
      "ShaderCache",
      "GrShaderCache",
      "GraphiteDawnCache",
      "Default/Cache",
      "Default/Code Cache",
      "Default/GPUCache",
      "Default/Sessions",
      "Default/Current Session",
      "Default/Current Tabs",
      "Default/Last Session",
      "Default/Last Tabs",
      "Default/History",
      "Default/History-journal",
      "Default/Visited Links",
      "Default/Cookies",
      "Default/Cookies-journal",
      "Default/Network/Cookies",
      "Default/Network/Cookies-journal",
      "Default/Login Data",
      "Default/Login Data For Account",
      "Default/Web Data",
      "Default/Local Storage",
      "Default/Session Storage",
      "Default/IndexedDB"
    ];

    for (const volatilePath of volatilePaths) {
      rmSync(path.join(profilePath, volatilePath), { recursive: true, force: true });
    }
  }

  private slug(value: string): string {
    const slug = value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "-")
      .replace(/_/g, "-")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || "item";
  }
}
