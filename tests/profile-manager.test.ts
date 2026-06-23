import { describe, expect, it } from "vitest";
import { ProfileManager } from "../src/main/profiles/profile-manager";

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
});
