import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findUnpackedChromeExtensions } from "../src/main/runtime-resources";

function writeNestedFile(filePath: string, value: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

describe("runtime resources", () => {
  it("finds unpacked Chrome extensions from bundled resource folders", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-resources-"));
    const root = path.join(dir, "chrome-extensions");
    writeNestedFile(path.join(root, "extension-a", "manifest.json"), "{}");
    writeNestedFile(path.join(root, "extension-b", "1.0.0_0", "manifest.json"), "{}");
    writeNestedFile(path.join(root, "notes", "README.md"), "not an extension");

    expect(findUnpackedChromeExtensions(root)).toEqual([
      path.join(root, "extension-a"),
      path.join(root, "extension-b", "1.0.0_0")
    ]);
  });
});
