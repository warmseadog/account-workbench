export interface ChromeCommand {
  executable: string;
  args: string[];
}

export interface ChromeLaunchCommandOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  executablePath?: string;
}

export function createChromeLaunchCommands(args: string[], options: ChromeLaunchCommandOptions = {}): ChromeCommand[] {
  if (options.executablePath) {
    return [{ executable: options.executablePath, args }];
  }

  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;

  if (platform === "darwin") {
    return [{ executable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args }];
  }

  if (platform === "win32") {
    return getWindowsChromeExecutableCandidates(env).map((executable) => ({ executable, args }));
  }

  return ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"].map((executable) => ({
    executable,
    args
  }));
}

export function getWindowsChromeExecutableCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  return uniqueNonEmpty([
    pathJoinWindows(env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
    pathJoinWindows(env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
    pathJoinWindows(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "chrome.exe",
    "chrome"
  ]);
}

function pathJoinWindows(root: string | undefined, ...segments: string[]): string | undefined {
  if (!root) {
    return undefined;
  }

  return [root.replace(/\\+$/, ""), ...segments].join("\\");
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
