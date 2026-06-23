export interface AppRuntimeConfig {
  devAutoUnlock: boolean;
}

export interface AppRuntimeEnv {
  VITE_DEV_SERVER_URL?: string;
  ACCOUNT_WORKBENCH_DEV_MASTER_PASSWORD?: string;
}

export const DEFAULT_DEV_MASTER_PASSWORD = "12345678";

export function createAppRuntimeConfig(env: AppRuntimeEnv): AppRuntimeConfig {
  return {
    devAutoUnlock: Boolean(env.VITE_DEV_SERVER_URL)
  };
}

export function getDevMasterPassword(env: AppRuntimeEnv): string {
  return env.ACCOUNT_WORKBENCH_DEV_MASTER_PASSWORD || DEFAULT_DEV_MASTER_PASSWORD;
}
