import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { LoginAdapterRules } from "../adapters/login-adapter.js";
import type { CryptoVault } from "../crypto/vault.js";
import type { ProfileManager } from "../profiles/profile-manager.js";
import type { SqliteRow, SqliteStore } from "../storage/sqlite-store.js";
import type {
  Account,
  AccountSecretMetadata,
  AccountSecrets,
  AccountStatus,
  LoginAuthMode,
  LoginAdapter,
  LoginDetectionRule,
  LoginFlowStep,
  Platform
} from "../../shared/models.js";

export interface CreatePlatformInput {
  name: string;
  baseUrl: string;
  loginUrl: string;
  allowedOrigins: string[];
  homeUrl?: string;
}

export interface CreateAccountInput {
  platformId: string;
  displayName: string;
  username: string;
  password?: string;
  secretMeta?: AccountSecretMetadata;
  tags?: string[];
}

export interface ImportAccountsFromFileInput {
  filePath: string;
}

export interface ImportAccountsFromFileResult {
  platform: Platform;
  imported: number;
  skippedDuplicates: number;
  skippedInvalid: number;
}

export interface SaveLoginAdapterInput {
  platformId: string;
  authMode?: LoginAuthMode;
  usernameLocator: string;
  passwordLocator: string;
  submitLocator: string;
  startLocator?: string;
  flowSteps?: LoginFlowStep[];
  successRules: LoginDetectionRule[];
  failureRules: LoginDetectionRule[];
  manualRules: LoginDetectionRule[];
}

export interface AccountSummary {
  id: string;
  platformId: string;
  displayName: string;
  usernamePreview: string;
  tags: string[];
  profileId: string;
  status: AccountStatus;
  hasPassword: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDetail extends AccountSummary {
  username: string;
  password?: string;
  secretMeta: AccountSecretMetadata;
}

interface PlatformRow extends SqliteRow {
  id: string;
  name: string;
  base_url: string;
  login_url: string;
  allowed_origins: string;
  home_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountRow extends SqliteRow {
  id: string;
  platform_id: string;
  display_name: string;
  username_enc: string;
  password_enc: string;
  secret_meta_enc: string;
  tags: string;
  profile_id: string;
  status: AccountStatus;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LoginAdapterRow extends SqliteRow {
  id: string;
  platform_id: string;
  auth_mode: LoginAuthMode;
  username_locator: string;
  password_locator: string;
  submit_locator: string;
  start_locator: string | null;
  flow_steps: string;
  success_rules: string;
  failure_rules: string;
  manual_rules: string;
  created_at: string;
  updated_at: string;
}

const DOLA_LOGIN_ENTRY_LOCATOR = "button:has-text('登录'), button:has-text('Log In')";
const DOLA_GOOGLE_ENTRY_LOCATOR =
  "button:has-text('Google'), button:has-text('谷歌'), [data-disabled='false']:has(img[src^='data:image/png'])";
const GOOGLE_IDENTIFIER_LOCATOR = "#identifierId, input[name='identifier']";
const GOOGLE_PASSWORD_LOCATOR = "input[name='Passwd'], input[type='password']:not([aria-hidden='true'])";
const DOLA_GOOGLE_PASSWORD_FLOW_STEPS: LoginFlowStep[] = [
  { type: "click", locator: DOLA_LOGIN_ENTRY_LOCATOR },
  { type: "click", locator: DOLA_GOOGLE_ENTRY_LOCATOR },
  { type: "fill_username", locator: GOOGLE_IDENTIFIER_LOCATOR },
  { type: "click", locator: "#identifierNext" },
  { type: "fill_password", locator: GOOGLE_PASSWORD_LOCATOR },
  { type: "click", locator: "#passwordNext" }
];
const DOLA_GOOGLE_PLATFORM_NAMES = ["Dola Google 自动填充", "Dola Google 手动会话", "Dola Google 密码登录"];
const DOLA_LOGIN_MANUAL_RULES: LoginDetectionRule[] = [
  { type: "selector_visible", value: "input[placeholder='请输入手机号']" },
  { type: "selector_visible", value: "input[placeholder='Phone number']" },
  { type: "selector_visible", value: "text=登录以解锁更多功能" },
  { type: "selector_visible", value: "text=Log In to Unlock More Features" },
  { type: "selector_visible", value: "text=打开 Dola App" },
  { type: "selector_visible", value: "text=Scan QR code with Dola App" },
  { type: "selector_visible", value: "iframe[src*='recaptcha']" },
  { type: "selector_visible", value: "input[type='tel']" },
  { type: "selector_visible", value: "#idvPin" },
  { type: "selector_visible", value: "input[name='idvPin']" },
  { type: "selector_visible", value: "input[name='totpPin']" },
  { type: "selector_visible", value: "text=2-Step Verification" },
  { type: "selector_visible", value: "text=两步验证" },
  { type: "selector_visible", value: "text=Verify it’s you" },
  { type: "selector_visible", value: "text=验证身份" },
  { type: "selector_visible", value: "text=Confirm your recovery email" },
  { type: "selector_visible", value: "text=输入辅助邮箱地址" },
  { type: "selector_visible", value: "text=Get a verification code" },
  { type: "selector_visible", value: "text=输入验证码" },
  { type: "selector_visible", value: "text=This browser or app may not be secure" },
  { type: "selector_visible", value: "text=此浏览器或应用可能不安全" }
];
const DOLA_GOOGLE_FAILURE_RULES: LoginDetectionRule[] = [
  { type: "selector_visible", value: "text=Couldn’t find your Google Account" },
  { type: "selector_visible", value: "text=找不到您的 Google 账号" },
  { type: "selector_visible", value: "text=找不到您的 Google 帐号" },
  { type: "selector_visible", value: "text=Enter a valid email or phone number" },
  { type: "selector_visible", value: "text=请输入有效的电子邮件地址或电话号码" },
  { type: "selector_visible", value: "text=Wrong password. Try again" },
  { type: "selector_visible", value: "text=密码错误" }
];
export class WorkbenchService {
  constructor(
    private readonly store: SqliteStore,
    private readonly vault: CryptoVault,
    private readonly profiles: ProfileManager
  ) {}

  createPlatform(input: CreatePlatformInput): Platform {
    new LoginAdapterRules({ allowedOrigins: input.allowedOrigins });
    const now = new Date().toISOString();
    const platform: Platform = {
      id: randomUUID(),
      name: input.name.trim(),
      baseUrl: input.baseUrl,
      loginUrl: input.loginUrl,
      allowedOrigins: input.allowedOrigins,
      homeUrl: input.homeUrl,
      createdAt: now,
      updatedAt: now
    };

    this.store.run(
      `INSERT INTO platforms
        (id, name, base_url, login_url, allowed_origins, home_url, created_at, updated_at)
       VALUES
        (:id, :name, :baseUrl, :loginUrl, :allowedOrigins, :homeUrl, :createdAt, :updatedAt)`,
      {
        id: platform.id,
        name: platform.name,
        baseUrl: platform.baseUrl,
        loginUrl: platform.loginUrl,
        allowedOrigins: JSON.stringify(platform.allowedOrigins),
        homeUrl: platform.homeUrl ?? null,
        createdAt: platform.createdAt,
        updatedAt: platform.updatedAt
      }
    );

    return platform;
  }

  listPlatforms(): Platform[] {
    return this.store
      .all<PlatformRow>("SELECT * FROM platforms ORDER BY created_at ASC")
      .map((row: PlatformRow) => this.platformFromRow(row));
  }

  getPlatform(platformId: string): Platform {
    return this.requirePlatform(platformId);
  }

  deletePlatform(platformId: string): void {
    this.requirePlatform(platformId);
    this.store.run("DELETE FROM platforms WHERE id = :id", { id: platformId });
  }

  saveLoginAdapter(input: SaveLoginAdapterInput): LoginAdapter {
    LoginAdapterRules.validateSelectors(input);
    const platform = this.requirePlatform(input.platformId);
    new LoginAdapterRules({ allowedOrigins: platform.allowedOrigins });
    const now = new Date().toISOString();
    const adapter: LoginAdapter = {
      id: randomUUID(),
      platformId: input.platformId,
      authMode: input.authMode ?? "password",
      usernameLocator: input.usernameLocator.trim(),
      passwordLocator: input.passwordLocator.trim(),
      submitLocator: input.submitLocator.trim(),
      startLocator: input.startLocator?.trim() || undefined,
      flowSteps: input.flowSteps ?? [],
      successRules: input.successRules,
      failureRules: input.failureRules,
      manualRules: input.manualRules,
      createdAt: now,
      updatedAt: now
    };

    this.store.run(
      `INSERT INTO login_adapters
        (id, platform_id, auth_mode, username_locator, password_locator, submit_locator, start_locator, flow_steps, success_rules, failure_rules, manual_rules, created_at, updated_at)
       VALUES
        (:id, :platformId, :authMode, :usernameLocator, :passwordLocator, :submitLocator, :startLocator, :flowSteps, :successRules, :failureRules, :manualRules, :createdAt, :updatedAt)`,
      {
        id: adapter.id,
        platformId: adapter.platformId,
        authMode: adapter.authMode,
        usernameLocator: adapter.usernameLocator,
        passwordLocator: adapter.passwordLocator,
        submitLocator: adapter.submitLocator,
        startLocator: adapter.startLocator ?? null,
        flowSteps: JSON.stringify(adapter.flowSteps ?? []),
        successRules: JSON.stringify(adapter.successRules),
        failureRules: JSON.stringify(adapter.failureRules),
        manualRules: JSON.stringify(adapter.manualRules),
        createdAt: adapter.createdAt,
        updatedAt: adapter.updatedAt
      }
    );

    return adapter;
  }

  createDolaPreset(): { platform: Platform; adapter: LoginAdapter } {
    const platform = this.createPlatform({
      name: "Dola",
      baseUrl: "https://www.dola.com/chat/",
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com"],
      homeUrl: "https://www.dola.com/chat/"
    });
    const adapter = this.saveLoginAdapter({
      platformId: platform.id,
      authMode: "manual_session",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      successRules: [],
      failureRules: [],
      manualRules: DOLA_LOGIN_MANUAL_RULES
    });

    return { platform, adapter };
  }

  createDolaGooglePasswordPreset(): { platform: Platform; adapter: LoginAdapter } {
    const platform = this.createPlatform({
      name: "Dola Google 自动填充",
      baseUrl: "https://www.dola.com/chat/",
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"],
      homeUrl: "https://www.dola.com/chat/"
    });
    const adapter = this.saveLoginAdapter({
      platformId: platform.id,
      ...this.dolaGooglePasswordAdapterInput()
    });

    return { platform, adapter };
  }

  importDolaGoogleAccountsFromFile(input: ImportAccountsFromFileInput): ImportAccountsFromFileResult {
    const rows = this.parseCredentialFile(input.filePath);
    const platform = this.ensureDolaGooglePasswordPlatform();
    const existingAccounts = new Map(
      this.store
        .all<AccountRow>("SELECT * FROM accounts WHERE platform_id = :platformId", { platformId: platform.id })
        .map((row) => [this.vault.decryptSecret(JSON.parse(row.username_enc)).toLowerCase(), row])
    );

    let imported = 0;
    let skippedDuplicates = 0;
    for (const row of rows.valid) {
      const normalizedUsername = row.username.toLowerCase();
      const existing = existingAccounts.get(normalizedUsername);
      if (existing) {
        if (!existing.password_enc) {
          this.updateAccountPassword(existing.id, row.password);
        }
        if (row.secretMeta) {
          this.updateAccountSecretMeta(existing.id, row.secretMeta);
        }
        skippedDuplicates += 1;
        continue;
      }

      imported += 1;
      const account = this.createAccount({
        platformId: platform.id,
        displayName: `Dola Google 账号 ${String(imported).padStart(3, "0")}`,
        username: row.username,
        password: row.password,
        secretMeta: row.secretMeta,
        tags: ["dola", "google", "imported"]
      });
      existingAccounts.set(normalizedUsername, this.requireAccountRow(account.id));
    }

    return {
      platform,
      imported,
      skippedDuplicates,
      skippedInvalid: rows.invalid
    };
  }

  getLoginAdapter(platformId: string): LoginAdapter | undefined {
    const platform = this.requirePlatform(platformId);
    const adapter = this.getLatestLoginAdapter(platformId);
    if (this.isDolaGooglePlatform(platform) && !this.isCurrentDolaGooglePasswordAdapter(adapter)) {
      this.saveLoginAdapter({
        platformId,
        ...this.dolaGooglePasswordAdapterInput()
      });
      return this.getLatestLoginAdapter(platformId);
    }

    return adapter;
  }

  private getLatestLoginAdapter(platformId: string): LoginAdapter | undefined {
    const row = this.store.get<LoginAdapterRow>(
      "SELECT * FROM login_adapters WHERE platform_id = :platformId ORDER BY created_at DESC, rowid DESC LIMIT 1",
      { platformId }
    );

    return row ? this.adapterFromRow(row) : undefined;
  }

  createAccount(input: CreateAccountInput): AccountSummary {
    this.requirePlatform(input.platformId);
    const now = new Date().toISOString();
    const accountId = randomUUID();
    const account: Account = {
      id: accountId,
      platformId: input.platformId,
      displayName: input.displayName.trim(),
      usernameEnc: this.vault.encryptSecret(input.username),
      passwordEnc: input.password ? this.vault.encryptSecret(input.password) : undefined,
      secretMetaEnc: input.secretMeta ? this.vault.encryptSecret(JSON.stringify(input.secretMeta)) : undefined,
      tags: input.tags ?? [],
      profileId: randomUUID(),
      status: "never_used",
      createdAt: now,
      updatedAt: now
    };

    this.profiles.ensureProfilePath(input.platformId, account.id);

    this.store.run(
      `INSERT INTO accounts
        (id, platform_id, display_name, username_enc, password_enc, secret_meta_enc, tags, profile_id, status, last_login_at, created_at, updated_at)
       VALUES
        (:id, :platformId, :displayName, :usernameEnc, :passwordEnc, :secretMetaEnc, :tags, :profileId, :status, :lastLoginAt, :createdAt, :updatedAt)`,
      {
        id: account.id,
        platformId: account.platformId,
        displayName: account.displayName,
        usernameEnc: JSON.stringify(account.usernameEnc),
        passwordEnc: account.passwordEnc ? JSON.stringify(account.passwordEnc) : "",
        secretMetaEnc: account.secretMetaEnc ? JSON.stringify(account.secretMetaEnc) : "",
        tags: JSON.stringify(account.tags),
        profileId: account.profileId,
        status: account.status,
        lastLoginAt: account.lastLoginAt ?? null,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      }
    );

    return this.accountSummaryFromRow(this.requireAccountRow(account.id));
  }

  listAccounts(platformId: string): AccountSummary[] {
    return this.store
      .all<AccountRow>(
        "SELECT * FROM accounts WHERE platform_id = :platformId ORDER BY created_at ASC",
        { platformId }
      )
      .map((row: AccountRow) => this.accountSummaryFromRow(row));
  }

  listAllAccounts(): AccountSummary[] {
    return this.store
      .all<AccountRow>("SELECT * FROM accounts ORDER BY created_at ASC")
      .map((row: AccountRow) => this.accountSummaryFromRow(row));
  }

  getAccount(accountId: string): AccountSummary {
    return this.accountSummaryFromRow(this.requireAccountRow(accountId));
  }

  getAccountDetail(accountId: string): AccountDetail {
    const row = this.requireAccountRow(accountId);

    return {
      ...this.accountSummaryFromRow(row),
      username: this.vault.decryptSecret(JSON.parse(row.username_enc)),
      password: row.password_enc ? this.vault.decryptSecret(JSON.parse(row.password_enc)) : undefined,
      secretMeta: this.decryptAccountSecretMeta(row)
    };
  }

  getProfilePath(accountId: string): string {
    const row = this.requireAccountRow(accountId);
    return this.profiles.ensureProfilePath(row.platform_id, row.id);
  }

  getAccountSecrets(accountId: string): AccountSecrets {
    const row = this.requireAccountRow(accountId);

    return {
      username: this.vault.decryptSecret(JSON.parse(row.username_enc)),
      password: row.password_enc ? this.vault.decryptSecret(JSON.parse(row.password_enc)) : undefined
    };
  }

  dumpRawAccountRow(accountId: string): AccountRow {
    return this.requireAccountRow(accountId);
  }

  deleteAccount(accountId: string): void {
    this.store.run("DELETE FROM accounts WHERE id = :id", { id: accountId });
  }

  private updateAccountPassword(accountId: string, password: string): void {
    this.store.run(
      "UPDATE accounts SET password_enc = :passwordEnc, updated_at = :updatedAt WHERE id = :id",
      {
        id: accountId,
        passwordEnc: JSON.stringify(this.vault.encryptSecret(password)),
        updatedAt: new Date().toISOString()
      }
    );
  }

  private updateAccountSecretMeta(accountId: string, secretMeta: AccountSecretMetadata): void {
    this.store.run(
      "UPDATE accounts SET secret_meta_enc = :secretMetaEnc, updated_at = :updatedAt WHERE id = :id",
      {
        id: accountId,
        secretMetaEnc: JSON.stringify(this.vault.encryptSecret(JSON.stringify(secretMeta))),
        updatedAt: new Date().toISOString()
      }
    );
  }

  private decryptAccountSecretMeta(row: AccountRow): AccountSecretMetadata {
    if (!row.secret_meta_enc) {
      return {};
    }

    return JSON.parse(this.vault.decryptSecret(JSON.parse(row.secret_meta_enc))) as AccountSecretMetadata;
  }

  private requirePlatform(platformId: string): Platform {
    const row = this.store.get<PlatformRow>("SELECT * FROM platforms WHERE id = :id", { id: platformId });
    if (!row) {
      throw new Error(`Platform not found: ${platformId}`);
    }
    return this.platformFromRow(row);
  }

  private ensureDolaGooglePasswordPlatform(): Platform {
    const existing = this.listPlatforms().find((platform) => DOLA_GOOGLE_PLATFORM_NAMES.includes(platform.name));
    if (!existing) {
      return this.createDolaGooglePasswordPreset().platform;
    }

    const adapter = this.getLoginAdapter(existing.id);
    if (!this.isCurrentDolaGooglePasswordAdapter(adapter)) {
      this.saveLoginAdapter({
        platformId: existing.id,
        ...this.dolaGooglePasswordAdapterInput()
      });
    }

    return existing;
  }

  private dolaGooglePasswordAdapterInput(): Omit<SaveLoginAdapterInput, "platformId"> {
    return {
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      flowSteps: DOLA_GOOGLE_PASSWORD_FLOW_STEPS,
      successRules: [],
      failureRules: DOLA_GOOGLE_FAILURE_RULES,
      manualRules: DOLA_LOGIN_MANUAL_RULES
    };
  }

  private isDolaGooglePlatform(platform: Platform): boolean {
    return DOLA_GOOGLE_PLATFORM_NAMES.includes(platform.name);
  }

  private isCurrentDolaGooglePasswordAdapter(adapter: LoginAdapter | undefined): boolean {
    if (!adapter || adapter.authMode !== "flow_password") {
      return false;
    }

    const hasCurrentDolaPhoneRule = adapter.manualRules.some(
      (rule) => rule.type === "selector_visible" && rule.value === "input[placeholder='请输入手机号']"
    );
    const hasEnglishDolaPhoneRule = adapter.manualRules.some(
      (rule) => rule.type === "selector_visible" && rule.value === "input[placeholder='Phone number']"
    );
    const hasBroadDolaChatSuccessRule = adapter.successRules.some(
      (rule) => rule.type === "url_contains" && rule.value === "dola.com/chat"
    );
    const hasGoogleVerificationRule = adapter.manualRules.some(
      (rule) => rule.type === "selector_visible" && rule.value === "text=Verify it’s you"
    );
    const hasCurrentLoginEntry = adapter.flowSteps?.some(
      (step) => step.type === "click" && step.locator === DOLA_LOGIN_ENTRY_LOCATOR
    );
    const hasCurrentGoogleEntry = adapter.flowSteps?.some(
      (step) => step.type === "click" && step.locator === DOLA_GOOGLE_ENTRY_LOCATOR
    );
    const hasCurrentGoogleIdentifier = adapter.flowSteps?.some(
      (step) => step.type === "fill_username" && step.locator === GOOGLE_IDENTIFIER_LOCATOR
    );
    const hasCurrentGooglePassword = adapter.flowSteps?.some(
      (step) => step.type === "fill_password" && step.locator === GOOGLE_PASSWORD_LOCATOR
    );
    const hasGooglePasswordFailureRule = adapter.failureRules.some(
      (rule) => rule.type === "selector_visible" && rule.value === "text=Wrong password. Try again"
    );

    return Boolean(
      hasCurrentDolaPhoneRule &&
        hasEnglishDolaPhoneRule &&
        hasGoogleVerificationRule &&
        hasCurrentLoginEntry &&
        hasCurrentGoogleEntry &&
        hasCurrentGoogleIdentifier &&
        hasCurrentGooglePassword &&
        hasGooglePasswordFailureRule &&
        !hasBroadDolaChatSuccessRule
    );
  }

  private parseCredentialFile(filePath: string): {
    valid: Array<{ username: string; password: string; secretMeta?: AccountSecretMetadata }>;
    invalid: number;
  } {
    const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    const lines = readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const valid: Array<{ username: string; password: string; secretMeta?: AccountSecretMetadata }> = [];
    let invalid = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (line.toLowerCase() === "copy") {
        invalid += 1;
        continue;
      }

      const parts = this.splitCredentialLine(line);
      const usernameIndex = parts.findIndex((part) => emailPattern.test(part));
      const username = usernameIndex >= 0 ? parts[usernameIndex] : "";
      const password = usernameIndex >= 0 ? parts[usernameIndex + 1] ?? "" : "";

      if (!username || !password) {
        invalid += 1;
        continue;
      }

      const secretMeta = this.parseCredentialMetadata(parts, usernameIndex);
      const metadataLineOffset = lines[lineIndex + 1]?.toLowerCase() === "copy" ? 2 : 1;
      const metadataLine = lines[lineIndex + metadataLineOffset];
      if (metadataLine && !this.splitCredentialLine(metadataLine).some((part) => emailPattern.test(part))) {
        const metadataParts = this.splitCredentialLine(metadataLine);
        if (metadataParts.length >= 2) {
          secretMeta.verificationSecret = metadataParts[0];
          secretMeta.region = metadataParts[1];
          secretMeta.year = metadataParts[2];
          lineIndex += metadataLineOffset;
        }
      }

      valid.push({ username, password, secretMeta: Object.keys(secretMeta).length > 0 ? secretMeta : undefined });
    }

    return { valid, invalid };
  }

  private parseCredentialMetadata(parts: string[], usernameIndex: number): AccountSecretMetadata {
    const secretMeta: AccountSecretMetadata = {};
    const extraCode = usernameIndex >= 0 ? parts[usernameIndex + 2] : undefined;
    if (extraCode) {
      secretMeta.extraCode = extraCode;
    }

    return secretMeta;
  }

  private splitCredentialLine(line: string): string[] {
    const separators = ["----", "---", "\t", "|", ",", ";"];
    const separator = separators.find((candidate) => line.includes(candidate));
    if (separator) {
      return line.split(separator).map((part) => part.trim()).filter(Boolean);
    }

    return line.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  }

  private requireAccountRow(accountId: string): AccountRow {
    const row = this.store.get<AccountRow>("SELECT * FROM accounts WHERE id = :id", { id: accountId });
    if (!row) {
      throw new Error(`Account not found: ${accountId}`);
    }
    return row;
  }

  private platformFromRow(row: PlatformRow): Platform {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      loginUrl: row.login_url,
      allowedOrigins: JSON.parse(row.allowed_origins),
      homeUrl: row.home_url ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private adapterFromRow(row: LoginAdapterRow): LoginAdapter {
    return {
      id: row.id,
      platformId: row.platform_id,
      authMode: row.auth_mode ?? "password",
      usernameLocator: row.username_locator,
      passwordLocator: row.password_locator,
      submitLocator: row.submit_locator,
      startLocator: row.start_locator ?? undefined,
      flowSteps: JSON.parse(row.flow_steps || "[]"),
      successRules: JSON.parse(row.success_rules),
      failureRules: JSON.parse(row.failure_rules),
      manualRules: JSON.parse(row.manual_rules),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private accountSummaryFromRow(row: AccountRow): AccountSummary {
    const username = this.vault.decryptSecret(JSON.parse(row.username_enc));

    return {
      id: row.id,
      platformId: row.platform_id,
      displayName: row.display_name,
      usernamePreview: this.previewUsername(username),
      tags: JSON.parse(row.tags),
      profileId: row.profile_id,
      status: row.status,
      hasPassword: row.password_enc.length > 0,
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private previewUsername(username: string): string {
    const [local, domain] = username.split("@");
    const prefix = local.at(0) ?? "*";
    return domain ? `${prefix}***@${domain}` : `${prefix}***`;
  }
}
