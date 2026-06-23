export type EntityId = string;

export type AccountStatus =
  | "never_used"
  | "session_active"
  | "needs_manual"
  | "login_failed"
  | "adapter_error";

export type LoginRunStatus =
  | "queued"
  | "opening_browser"
  | "checking_session"
  | "filling_credentials"
  | "waiting_for_result"
  | "manual_handoff"
  | "succeeded"
  | "failed";

export type LoginAuthMode = "password" | "manual_session" | "flow_password";

export type LoginFlowStepType = "click" | "fill_username" | "fill_password";

export interface LoginFlowStep {
  type: LoginFlowStepType;
  locator: string;
}

export interface EncryptedSecret {
  version: 1;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface Platform {
  id: EntityId;
  name: string;
  baseUrl: string;
  loginUrl: string;
  allowedOrigins: string[];
  homeUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: EntityId;
  platformId: EntityId;
  displayName: string;
  usernameEnc: EncryptedSecret;
  passwordEnc?: EncryptedSecret;
  tags: string[];
  profileId: EntityId;
  status: AccountStatus;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSecrets {
  username: string;
  password?: string;
}

export interface BrowserProfile {
  id: EntityId;
  accountId: EntityId;
  profilePath: string;
  browserType: "chromium";
  lockState: "available" | "locked";
  lastUsedAt?: string;
}

export interface LoginAdapter {
  id: EntityId;
  platformId: EntityId;
  authMode: LoginAuthMode;
  usernameLocator: string;
  passwordLocator: string;
  submitLocator: string;
  startLocator?: string;
  flowSteps?: LoginFlowStep[];
  successRules: LoginDetectionRule[];
  failureRules: LoginDetectionRule[];
  manualRules: LoginDetectionRule[];
  createdAt: string;
  updatedAt: string;
}

export interface LoginDetectionRule {
  type: "url_contains" | "url_regex" | "selector_visible";
  value: string;
}

export interface LoginRunStep {
  at: string;
  status: LoginRunStatus;
  message: string;
}

export interface LoginRun {
  id: EntityId;
  accountId: EntityId;
  status: LoginRunStatus;
  startedAt: string;
  endedAt?: string;
  steps: LoginRunStep[];
  errorCode?: string;
  requiresManual: boolean;
}

export interface AuditLog {
  id: EntityId;
  actor: "local_user" | "system";
  action: string;
  entityType: string;
  entityId?: string;
  message: string;
  redactedMeta: Record<string, unknown>;
  createdAt: string;
}
