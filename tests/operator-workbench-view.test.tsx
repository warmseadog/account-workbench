import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OperatorWorkbenchView,
  type OperatorWorkbenchViewProps
} from "../src/renderer/App";

const now = "2026-06-25T08:00:00.000Z";

function createProps(overrides: Partial<OperatorWorkbenchViewProps> = {}): OperatorWorkbenchViewProps {
  const props: OperatorWorkbenchViewProps = {
    activeRuns: 0,
    accountDetails: {
      account_1: {
        id: "account_1",
        platformId: "platform_1",
        displayName: "Dola 01",
        usernamePreview: "op***@example.com",
        username: "operator@example.com",
        password: "secret-password",
        secretMeta: {
          verificationSecret: "otp-secret",
          region: "US",
          year: "2026"
        },
        tags: ["daily"],
        profileId: "profile_1",
        status: "never_used",
        hasPassword: true,
        createdAt: now,
        updatedAt: now
      }
    },
    accountFeedback: {},
    accountForm: {
      displayName: "",
      username: "",
      password: "",
      verificationSecret: "",
      extraCode: "",
      region: "",
      year: "",
      tags: ""
    },
    accounts: [
      {
        id: "account_1",
        platformId: "platform_1",
        displayName: "Dola 01",
        usernamePreview: "op***@example.com",
        tags: ["daily"],
        profileId: "profile_1",
        status: "never_used",
        hasPassword: true,
        createdAt: now,
        updatedAt: now
      }
    ],
    adapterForm: {
      authMode: "flow_password",
      usernameLocator: "",
      passwordLocator: "",
      submitLocator: "",
      startLocator: "",
      flowSteps: "",
      successSelector: "",
      failureSelector: "",
      manualSelector: ""
    },
    bulkCount: 5,
    bulkRangeEnd: 1,
    bulkStartIndex: 1,
    credentialFilePath: "/tmp/accounts.txt",
    currentTargetUrl: "https://www.dola.com/chat/?from_logout=1",
    isFlowPasswordAdapter: true,
    isManualSessionAdapter: false,
    logs: [],
    platformForm: {
      name: "",
      baseUrl: "",
      loginUrl: "",
      allowedOrigins: ""
    },
    platforms: [
      {
        id: "platform_1",
        name: "Dola Google 自动填充",
        baseUrl: "https://www.dola.com",
        loginUrl: "https://www.dola.com/chat/?from_logout=1",
        allowedOrigins: ["https://www.dola.com"],
        createdAt: now,
        updatedAt: now
      }
    ],
    selectedAccountId: undefined,
    selectedBulkAccountIds: ["account_1"],
    selectedBulkAccounts: [
      {
        id: "account_1",
        platformId: "platform_1",
        displayName: "Dola 01",
        usernamePreview: "op***@example.com",
        tags: ["daily"],
        profileId: "profile_1",
        status: "never_used",
        hasPassword: true,
        createdAt: now,
        updatedAt: now
      }
    ],
    selectedPlatform: {
      id: "platform_1",
      name: "Dola Google 自动填充",
      baseUrl: "https://www.dola.com",
      loginUrl: "https://www.dola.com/chat/?from_logout=1",
      allowedOrigins: ["https://www.dola.com"],
      createdAt: now,
      updatedAt: now
    },
    selectedPlatformId: "platform_1",
    visibleAccounts: [
      {
        id: "account_1",
        platformId: "platform_1",
        displayName: "Dola 01",
        usernamePreview: "op***@example.com",
        tags: ["daily"],
        profileId: "profile_1",
        status: "never_used",
        hasPassword: true,
        createdAt: now,
        updatedAt: now
      }
    ],
    onAdapterFormChange: vi.fn(),
    onAccountFormChange: vi.fn(),
    onBulkLaunch: vi.fn(),
    onBulkCountChange: vi.fn(),
    onBulkStartChange: vi.fn(),
    onCreateAccount: vi.fn(),
    onCreateDolaGooglePasswordPreset: vi.fn(),
    onCreateDolaPreset: vi.fn(),
    onCreatePlatform: vi.fn(),
    onCredentialFilePathChange: vi.fn(),
    onDeleteAccount: vi.fn(),
    onDeletePlatform: vi.fn(),
    onImportDolaGoogleAccounts: vi.fn(),
    onLaunch: vi.fn(),
    onOpenCameraPermissions: vi.fn(),
    onOpenProfileTemplate: vi.fn(),
    onOpenSession: vi.fn(),
    onPickCredentialFile: vi.fn(),
    onPlatformFormChange: vi.fn(),
    onResetAccountProfile: vi.fn(),
    onSaveAdapter: vi.fn(),
    onSelectAccount: vi.fn(),
    onSelectBulkAccount: vi.fn(),
    onSelectCurrentBulkRange: vi.fn(),
    onSelectNextBulkRange: vi.fn(),
    onSelectPlatform: vi.fn(),
    onSetSelectedBulkAccountIds: vi.fn(),
    ...overrides
  };

  return props;
}

describe("OperatorWorkbenchView", () => {
  it("renders the default screen as a simplified operator task surface", () => {
    const html = renderToStaticMarkup(<OperatorWorkbenchView {...createProps()} />);

    expect(html).toContain("运营执行台");
    expect(html).toContain("开始当前批次");
    expect(html).toContain("任务列表");
    expect(html).toContain("步骤反馈");
    expect(html).toContain("管理员维护");
    expect(html).toContain("账号");
    expect(html).toContain("地区/年份");
    expect(html).toContain("状态");

    expect(html).not.toContain("<span>密码</span>");
    expect(html).not.toContain("<span>验证密钥</span>");
    expect(html).not.toContain("删除平台");
    expect(html).not.toContain("用模板重置 Profile");
    expect(html).not.toContain("登录适配器");
    expect(html).not.toContain("账号字段 selector");
  });

  it("places maintenance in the sidebar and execution feedback in the bottom dock", () => {
    const html = renderToStaticMarkup(<OperatorWorkbenchView {...createProps()} />);

    expect(html).toContain("class=\"maintenance-panel sidebar-maintenance\"");
    expect(html).toContain("class=\"feedback-dock\"");
    expect(html).toContain("feedback-account-detail");
    expect(html).toContain("步骤反馈");
    expect(html).toContain("最近反馈");

    expect(html).not.toContain("class=\"operator-inspector\"");
    expect(html).not.toContain("class=\"maintenance-panel account-maintenance\"");
  });

  it("shows the full plaintext 2FA secret in the account list and selected account details", () => {
    const html = renderToStaticMarkup(
      <OperatorWorkbenchView {...createProps({ selectedAccountId: "account_1" })} />
    );

    expect(html).toContain("2FA 密钥");
    expect(html).toContain("otp-secret");
    expect(html).toContain("2FA 密钥: otp-secret");
    expect(html).not.toContain("验证信息: otp-secret");
  });
});
