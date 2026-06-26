import type { BundledChromeExtensionStatus } from "../../shared/models.js";

export function createBundledChromeExtensionStatus(extensionPaths: string[]): BundledChromeExtensionStatus {
  const paths = extensionPaths.map((item) => item.trim()).filter(Boolean);
  if (paths.length === 0) {
    return {
      state: "missing",
      count: 0,
      paths: [],
      message: "未检测到内置浏览器插件；仍可继续上号，部分账号可能需要手动处理。"
    };
  }

  return {
    state: "available",
    count: paths.length,
    paths,
    message: `已内置 ${paths.length} 个浏览器插件，上号浏览器启动时会自动加载。`
  };
}
