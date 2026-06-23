import { describe, expect, it } from "vitest";
import { ManualSessionRunner, type ManualBrowserOpener } from "../src/main/runs/manual-session-runner";
import type { Platform } from "../src/shared/models";

class RecordingManualBrowserOpener implements ManualBrowserOpener {
  requests: Array<{ profilePath: string; url: string }> = [];

  async openProfile(request: { profilePath: string; url: string }): Promise<void> {
    this.requests.push(request);
  }
}

function platform(): Platform {
  return {
    id: "platform-1",
    name: "Dola Google",
    baseUrl: "https://www.dola.com/chat/",
    loginUrl: "https://www.dola.com/chat/?from_logout=1",
    allowedOrigins: ["https://www.dola.com", "https://accounts.google.com"],
    homeUrl: "https://www.dola.com/chat/",
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

describe("ManualSessionRunner", () => {
  it("opens the account profile in normal Chrome and returns manual handoff", async () => {
    const opener = new RecordingManualBrowserOpener();
    const runner = new ManualSessionRunner(opener);

    const run = await runner.run({
      accountId: "account-1",
      profilePath: "/tmp/account-workbench/profile-1",
      platform: platform()
    });

    expect(opener.requests).toEqual([
      {
        profilePath: "/tmp/account-workbench/profile-1",
        url: "https://www.dola.com/chat/?from_logout=1"
      }
    ]);
    expect(run.status).toBe("manual_handoff");
    expect(run.requiresManual).toBe(true);
    expect(run.steps.map((step) => step.message).join("\n")).toContain("普通 Chrome");
  });
});
