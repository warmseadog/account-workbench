import { describe, expect, it } from "vitest";
import { createMainWindowOptions } from "../src/main/window-options";

describe("createMainWindowOptions", () => {
  it("uses an unsandboxed isolated renderer so the ESM preload bridge can run", () => {
    const options = createMainWindowOptions("/tmp/preload.js");

    expect(options.webPreferences?.preload).toBe("/tmp/preload.js");
    expect(options.webPreferences?.sandbox).toBe(false);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
  });
});
