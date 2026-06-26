import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { BundledChromeExtensionStatus } from "../shared/models.js";
import { createBundledChromeExtensionStatus } from "./runs/chrome-extension-status.js";

export function getRuntimeResourcesRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }

  return path.join(process.cwd(), "resources");
}

export function getBundledProfileTemplatePath(resourcesRoot = getRuntimeResourcesRoot()): string | undefined {
  const templatePath = path.join(resourcesRoot, "profile-template", "user-data");
  return isNonEmptyDirectory(templatePath) ? templatePath : undefined;
}

export function getBundledChromeExtensionPaths(resourcesRoot = getRuntimeResourcesRoot()): string[] {
  return findUnpackedChromeExtensions(path.join(resourcesRoot, "chrome-extensions"));
}

export function getBundledChromeExtensionStatus(resourcesRoot = getRuntimeResourcesRoot()): BundledChromeExtensionStatus {
  return createBundledChromeExtensionStatus(getBundledChromeExtensionPaths(resourcesRoot));
}

export function findUnpackedChromeExtensions(extensionsRoot: string): string[] {
  try {
    return readdirSync(extensionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => findExtensionManifestRoots(path.join(extensionsRoot, entry.name)))
      .sort();
  } catch {
    return [];
  }
}

function findExtensionManifestRoots(candidatePath: string): string[] {
  if (existsSync(path.join(candidatePath, "manifest.json"))) {
    return [candidatePath];
  }

  try {
    return readdirSync(candidatePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(candidatePath, entry.name))
      .filter((versionPath) => existsSync(path.join(versionPath, "manifest.json")));
  } catch {
    return [];
  }
}

function isNonEmptyDirectory(directoryPath: string): boolean {
  try {
    return existsSync(directoryPath) && readdirSync(directoryPath).length > 0;
  } catch {
    return false;
  }
}
