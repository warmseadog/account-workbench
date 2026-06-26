import { describe, expect, it } from "vitest";
import { createChromeLaunchCommands, getWindowsChromeExecutableCandidates } from "../src/main/runs/chrome-executable";

describe("Chrome executable discovery", () => {
  it("checks common Windows Chrome install paths before PATH fallbacks", () => {
    const candidates = getWindowsChromeExecutableCandidates({
      LOCALAPPDATA: "C:\\Users\\ops\\AppData\\Local",
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)"
    });

    expect(candidates.slice(0, 3)).toEqual([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Users\\ops\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"
    ]);
    expect(candidates).toContain("chrome.exe");
  });

  it("builds Windows launch commands with absolute Chrome paths before generic commands", () => {
    const commands = createChromeLaunchCommands(["--new-window", "about:blank"], {
      platform: "win32",
      env: {
        LOCALAPPDATA: "C:\\Users\\ops\\AppData\\Local",
        ProgramFiles: "C:\\Program Files"
      }
    });

    expect(commands[0]).toEqual({
      executable: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--new-window", "about:blank"]
    });
    expect(commands.at(-1)?.executable).toBe("chrome");
  });

  it("uses an explicit executable path when one is configured", () => {
    const commands = createChromeLaunchCommands(["--profile-directory=Default"], {
      platform: "win32",
      executablePath: "D:\\Chrome\\chrome.exe"
    });

    expect(commands).toEqual([
      {
        executable: "D:\\Chrome\\chrome.exe",
        args: ["--profile-directory=Default"]
      }
    ]);
  });
});
