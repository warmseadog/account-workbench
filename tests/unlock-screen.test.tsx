import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UnlockScreen } from "../src/renderer/UnlockScreen";

describe("UnlockScreen", () => {
  it("renders unlock errors on the locked screen", () => {
    const html = renderToStaticMarkup(
      <UnlockScreen
        masterPassword="12345678"
        error="当前不是 Electron 安全运行环境，无法访问本地账号库。"
        isUnlocking={false}
        onMasterPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain("当前不是 Electron 安全运行环境");
  });
});
