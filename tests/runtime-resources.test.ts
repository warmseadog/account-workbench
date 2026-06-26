import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findUnpackedChromeExtensions, getBundledChromeExtensionStatus } from "../src/main/runtime-resources";

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

  it("reports available bundled Chrome extensions for operator visibility", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-resources-"));
    writeNestedFile(path.join(dir, "chrome-extensions", "extension-a", "manifest.json"), "{}");
    writeNestedFile(path.join(dir, "chrome-extensions", "extension-b", "1.0.0_0", "manifest.json"), "{}");

    expect(getBundledChromeExtensionStatus(dir)).toEqual({
      state: "available",
      count: 2,
      paths: [
        path.join(dir, "chrome-extensions", "extension-a"),
        path.join(dir, "chrome-extensions", "extension-b", "1.0.0_0")
      ],
      message: "已内置 2 个浏览器插件，上号浏览器启动时会自动加载。"
    });
  });

  it("reports missing bundled Chrome extensions without blocking login", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "account-workbench-resources-"));

    expect(getBundledChromeExtensionStatus(dir)).toEqual({
      state: "missing",
      count: 0,
      paths: [],
      message: "未检测到内置浏览器插件；仍可继续上号，部分账号可能需要手动处理。"
    });
  });
});
