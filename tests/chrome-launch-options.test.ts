import { describe, expect, it } from "vitest";
import { createChromeExtensionArgs } from "../src/main/runs/chrome-launch-options";

describe("Chrome launch options", () => {
  it("adds bundled unpacked extension directories to Chrome launch args", () => {
    expect(createChromeExtensionArgs(["/opt/account-workbench/ext-a", "/opt/account-workbench/ext-b"])).toEqual([
      "--load-extension=/opt/account-workbench/ext-a,/opt/account-workbench/ext-b"
    ]);
  });

  it("omits extension args when no bundled extension directories are available", () => {
    expect(createChromeExtensionArgs([])).toEqual([]);
    expect(createChromeExtensionArgs(["", "   "])).toEqual([]);
  });
});
