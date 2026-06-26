export function createChromeExtensionArgs(extensionPaths: string[] = []): string[] {
  const normalizedPaths = extensionPaths.map((item) => item.trim()).filter(Boolean);
  if (normalizedPaths.length === 0) {
    return [];
  }

  return [`--load-extension=${normalizedPaths.join(",")}`];
}
