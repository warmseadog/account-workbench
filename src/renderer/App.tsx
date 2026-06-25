import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AccountDetail, AccountSummary } from "../main/services/workbench-service";
import type { LoginAdapter, LoginAuthMode, LoginRun, Platform } from "../shared/models";
import {
  MAX_BULK_LAUNCH_ACCOUNTS,
  pruneBulkSelection,
  selectBulkAccountRange,
  toggleBulkAccountSelection
} from "./bulk-selection";
import {
  describeLoginRunFeedback,
  describeSessionOpenFeedback,
  type RunFeedback
} from "./run-feedback";
import {
  BULK_LAUNCH_CONCURRENCY,
  BULK_LAUNCH_STAGGER_MS,
  runBulkLaunchQueue
} from "./bulk-launch-queue";
import { UnlockScreen } from "./UnlockScreen";

interface UiLog {
  id: string;
  at: string;
  level: "info" | "error" | "success";
  message: string;
}

const emptyPlatformForm = {
  name: "",
  baseUrl: "",
  loginUrl: "",
  allowedOrigins: ""
};

const emptyAdapterForm = {
  authMode: "password" as LoginAuthMode,
  usernameLocator: "",
  passwordLocator: "",
  submitLocator: "",
  startLocator: "",
  flowSteps: "",
  successSelector: "",
  failureSelector: "",
  manualSelector: ""
};

const emptyAccountForm = {
  displayName: "",
  username: "",
  password: "",
  verificationSecret: "",
  extraCode: "",
  region: "",
  year: "",
  tags: ""
};

const defaultCredentialFilePath =
  "/Users/wy/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_y4n4ti9i609h22_2b2c/temp/RWTemp/2026-06/737931ae46efbcd310450ddf2986b74a/100.txt";

function getDefaultPlatformId(platforms: Platform[]): string | undefined {
  return (
    platforms.find((platform) =>
      platform.name === "Dola Google 自动填充" ||
      platform.name === "Dola Google 手动会话" ||
      platform.name === "Dola Google 密码登录"
    )
      ?.id ?? platforms[0]?.id
  );
}

function adapterToForm(adapter: LoginAdapter) {
  return {
    authMode: adapter.authMode,
    usernameLocator: adapter.usernameLocator,
    passwordLocator: adapter.passwordLocator,
    submitLocator: adapter.submitLocator,
    startLocator: adapter.startLocator ?? "",
    flowSteps: (adapter.flowSteps ?? []).map((step) => `${step.type}|${step.locator}`).join("\n"),
    successSelector: adapter.successRules.find((rule) => rule.type === "selector_visible")?.value ?? "",
    failureSelector: adapter.failureRules.find((rule) => rule.type === "selector_visible")?.value ?? "",
    manualSelector: adapter.manualRules.find((rule) => rule.type === "selector_visible")?.value ?? ""
  };
}

export function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string>();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>();
  const [selectedAccountId, setSelectedAccountId] = useState<string>();
  const [platformForm, setPlatformForm] = useState(emptyPlatformForm);
  const [adapterForm, setAdapterForm] = useState(emptyAdapterForm);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [credentialFilePath, setCredentialFilePath] = useState(defaultCredentialFilePath);
  const [logs, setLogs] = useState<UiLog[]>([]);
  const [activeRuns, setActiveRuns] = useState(0);
  const [selectedBulkAccountIds, setSelectedBulkAccountIds] = useState<string[]>([]);
  const [accountFeedback, setAccountFeedback] = useState<Record<string, RunFeedback>>({});
  const [accountDetails, setAccountDetails] = useState<Record<string, AccountDetail>>({});
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkStartIndex, setBulkStartIndex] = useState(1);

  const bridge = window.accountWorkbench;
  const selectedPlatform = platforms.find((platform) => platform.id === selectedPlatformId);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const selectedAccountDetail = selectedAccountId ? accountDetails[selectedAccountId] : undefined;
  const isManualSessionAdapter = adapterForm.authMode === "manual_session";
  const isFlowPasswordAdapter = adapterForm.authMode === "flow_password";
  const visibleAccounts = useMemo(
    () => accounts.filter((account) => !selectedPlatformId || account.platformId === selectedPlatformId),
    [accounts, selectedPlatformId]
  );
  const selectedBulkAccounts = useMemo(
    () =>
      selectedBulkAccountIds
        .map((accountId) => accounts.find((account) => account.id === accountId))
        .filter((account): account is AccountSummary => Boolean(account)),
    [accounts, selectedBulkAccountIds]
  );
  const currentTargetUrl = selectedPlatform?.loginUrl ?? "https://www.dola.com/chat/?from_logout=1";
  const bulkRangeEnd = Math.min(visibleAccounts.length, bulkStartIndex + bulkCount - 1);

  useEffect(() => {
    const activeBridge = bridge;
    if (!activeBridge || unlocked) return;
    let cancelled = false;

    async function autoUnlockForDevelopment(devBridge: NonNullable<typeof bridge>) {
      setIsUnlocking(true);
      try {
        const config = await devBridge.getAppConfig();
        if (!config.devAutoUnlock) {
          return;
        }

        await devBridge.devUnlockVault();
        if (cancelled) return;
        setUnlocked(true);
        setMasterPassword("");
        addLog("success", "开发模式已自动解锁本地账号库。");
      } catch (error) {
        if (cancelled) return;
        setUnlockError(error instanceof Error ? error.message : "开发模式自动解锁失败。");
      } finally {
        if (!cancelled) {
          setIsUnlocking(false);
        }
      }
    }

    void autoUnlockForDevelopment(activeBridge);

    return () => {
      cancelled = true;
    };
  }, [bridge, unlocked]);

  useEffect(() => {
    if (unlocked) {
      void refresh();
    }
  }, [unlocked, selectedPlatformId]);

  useEffect(() => {
    setSelectedBulkAccountIds((current) => {
      const pruned = pruneBulkSelection(current, visibleAccounts);
      return pruned.length > 0 ? pruned : selectBulkAccountRange(visibleAccounts, bulkStartIndex, bulkCount);
    });
  }, [visibleAccounts, bulkStartIndex, bulkCount]);

  useEffect(() => {
    if (visibleAccounts.length === 0) {
      setBulkStartIndex(1);
      return;
    }

    setBulkStartIndex((current) => Math.min(Math.max(1, current), visibleAccounts.length));
  }, [visibleAccounts.length]);

  useEffect(() => {
    if (!bridge || !unlocked || visibleAccounts.length === 0) return;
    const activeBridge = bridge;
    let cancelled = false;

    async function loadVisibleAccountDetails() {
      const missingAccounts = visibleAccounts.filter((account) => !accountDetails[account.id]);
      if (missingAccounts.length === 0) return;

      try {
        const details = await Promise.all(missingAccounts.map((account) => activeBridge.getAccountDetail(account.id)));
        if (cancelled) return;
        setAccountDetails((current) => {
          const next = { ...current };
          details.forEach((detail: AccountDetail) => {
            next[detail.id] = detail;
          });
          return next;
        });
      } catch (error) {
        addLog("error", error instanceof Error ? error.message : "读取账号完整信息失败。");
      }
    }

    void loadVisibleAccountDetails();

    return () => {
      cancelled = true;
    };
  }, [bridge, unlocked, visibleAccounts, accountDetails]);

  async function refresh() {
    if (!bridge) return;
    try {
      const nextPlatforms = await bridge.listPlatforms();
      const effectivePlatformId = selectedPlatformId ?? getDefaultPlatformId(nextPlatforms);
      const [nextAccounts, currentAdapter] = await Promise.all([
        bridge.listAccounts(effectivePlatformId),
        effectivePlatformId ? bridge.getLoginAdapter(effectivePlatformId) : Promise.resolve(undefined)
      ]);
      setPlatforms(nextPlatforms);
      setAccounts(nextAccounts);
      if (!selectedPlatformId && effectivePlatformId) {
        setSelectedPlatformId(effectivePlatformId);
      }
      if (effectivePlatformId) {
        setAdapterForm(currentAdapter ? adapterToForm(currentAdapter) : emptyAdapterForm);
      }
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "刷新账号库失败。");
    }
  }

  function addLog(level: UiLog["level"], message: string) {
    setLogs((current) => [
      { id: `${Date.now()}-${Math.random()}`, at: new Date().toLocaleTimeString(), level, message },
      ...current
    ].slice(0, 120));
  }

  function setAccountRunFeedback(accountId: string, feedback: RunFeedback) {
    setAccountFeedback((current) => ({ ...current, [accountId]: feedback }));
  }

  async function handleUnlock(event: FormEvent) {
    event.preventDefault();
    setUnlockError(undefined);
    if (!bridge) {
      const message = "当前不是 Electron 安全运行环境，无法访问本地账号库。";
      setUnlockError(message);
      addLog("error", message);
      return;
    }

    setIsUnlocking(true);
    try {
      await bridge.unlockVault(masterPassword);
      setUnlocked(true);
      setMasterPassword("");
      addLog("success", "本地账号库已解锁。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "解锁失败。";
      setUnlockError(message);
      addLog("error", message);
    } finally {
      setIsUnlocking(false);
    }
  }

  async function handleCreatePlatform(event: FormEvent) {
    event.preventDefault();
    if (!bridge) return;
    try {
      const platform = await bridge.createPlatform({
        name: platformForm.name,
        baseUrl: platformForm.baseUrl,
        loginUrl: platformForm.loginUrl,
        allowedOrigins: platformForm.allowedOrigins.split(",").map((origin) => origin.trim()).filter(Boolean)
      });
      setPlatformForm(emptyPlatformForm);
      setSelectedPlatformId(platform.id);
      addLog("success", `已添加平台：${platform.name}`);
      await refresh();
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "添加平台失败。");
    }
  }

  async function handleCreateDolaPreset() {
    if (!bridge) return;
    try {
      const preset = await bridge.createDolaPreset();
      setSelectedPlatformId(preset.platform.id);
      setAdapterForm({
        ...emptyAdapterForm,
        authMode: "manual_session",
        manualSelector: "input[placeholder='请输入手机号']"
      });
      addLog("success", "已创建 Dola 手动会话预设。首次登录请在独立浏览器里手动完成 Google/手机号/2FA。");
      await refresh();
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "创建 Dola 预设失败。");
    }
  }

  async function handleCreateDolaGooglePasswordPreset() {
    if (!bridge) return;
    try {
      const preset = await bridge.createDolaGooglePasswordPreset();
      setSelectedPlatformId(preset.platform.id);
      setAdapterForm({
        ...emptyAdapterForm,
        authMode: "flow_password",
        flowSteps: ((preset.adapter.flowSteps ?? []) as LoginAdapter["flowSteps"])
          ?.map((step) => `${step.type}|${step.locator}`)
          .join("\n") ?? "",
        manualSelector: "input[placeholder='请输入手机号']"
      });
      addLog("success", "已创建 Dola Google 自动填充预设。账号和密码会自动填入，验证码、短信或 2FA 由你手动完成。");
      await refresh();
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "创建 Dola Google 自动填充预设失败。");
    }
  }

  async function handleImportDolaGoogleAccounts() {
    if (!bridge) return;
    try {
      const result = await bridge.importDolaGoogleAccountsFromFile({ filePath: credentialFilePath });
      setSelectedPlatformId(result.platform.id);
      setAdapterForm({
        ...emptyAdapterForm,
        authMode: "flow_password",
        manualSelector: "input[placeholder='请输入手机号']"
      });
      addLog(
        "success",
        `已导入 ${result.imported} 个 Dola Google 账号，跳过重复 ${result.skippedDuplicates} 个，无法解析 ${result.skippedInvalid} 行；账号密码会加密保存并自动填入。`
      );
      await refresh();
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "导入 Dola Google 账号失败。");
    }
  }

  async function handlePickCredentialFile() {
    if (!bridge) return;
    try {
      const filePath = await bridge.pickAccountFile();
      if (filePath) {
        setCredentialFilePath(filePath);
      }
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "选择账号文件失败。");
    }
  }

  async function handleOpenProfileTemplate() {
    if (!bridge) return;
    try {
      const result = (await bridge.openProfileTemplate()) as { profilePath: string };
      addLog("success", `已打开浏览器模板窗口。安装扩展后关闭该窗口；新建账号会复制模板。路径：${result.profilePath}`);
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "打开浏览器模板失败。");
    }
  }

  async function handleOpenCameraPermissions() {
    if (!bridge) return;
    try {
      await bridge.openCameraPermissions();
      addLog("info", "已打开系统相机权限设置。请允许 Google Chrome 使用摄像头，然后回到验证页面重试。");
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "打开系统相机权限设置失败。");
    }
  }

  async function handleSaveAdapter(event: FormEvent) {
    event.preventDefault();
    if (!bridge || !selectedPlatformId) return;
    try {
      await bridge.saveLoginAdapter({
        platformId: selectedPlatformId,
        authMode: adapterForm.authMode,
        usernameLocator: adapterForm.usernameLocator,
        passwordLocator: adapterForm.passwordLocator,
        submitLocator: adapterForm.submitLocator,
        startLocator: adapterForm.startLocator,
        flowSteps: parseFlowSteps(adapterForm.flowSteps),
        successRules: adapterForm.successSelector ? [{ type: "selector_visible", value: adapterForm.successSelector }] : [],
        failureRules: adapterForm.failureSelector ? [{ type: "selector_visible", value: adapterForm.failureSelector }] : [],
        manualRules: adapterForm.manualSelector ? [{ type: "selector_visible", value: adapterForm.manualSelector }] : []
      });
      addLog("success", "登录适配器已保存。");
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "保存适配器失败。");
    }
  }

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    if (!bridge || !selectedPlatformId) return;
    try {
      await bridge.createAccount({
        platformId: selectedPlatformId,
        displayName: accountForm.displayName,
        username: accountForm.username,
        password: accountForm.password || undefined,
        secretMeta: {
          verificationSecret: accountForm.verificationSecret || undefined,
          extraCode: accountForm.extraCode || undefined,
          region: accountForm.region || undefined,
          year: accountForm.year || undefined
        },
        tags: accountForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      setAccountForm(emptyAccountForm);
      addLog("success", "账号已加密保存。");
      await refresh();
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "保存账号失败。");
    }
  }

  async function executeLaunch(accountId: string, accountLabel: string) {
    if (!bridge) return;
    setAccountRunFeedback(accountId, { level: "info", message: "正在打开浏览器" });
    addLog("info", `${accountLabel}：开始上号，正在打开独立浏览器 Profile。`);
    try {
      const run = (await bridge.launchLogin(accountId)) as LoginRun;
      const feedback = describeLoginRunFeedback(run);
      setAccountRunFeedback(accountId, feedback);
      run.steps.forEach((step) => addLog(step.status === "failed" ? "error" : "info", `${accountLabel}：${step.message}`));
      addLog(feedback.level, `${accountLabel}：${feedback.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "上号失败。";
      setAccountRunFeedback(accountId, { level: "error", message });
      addLog("error", `${accountLabel}：${message}`);
    }
  }

  async function handleLaunch(accountId: string) {
    const account = accounts.find((item) => item.id === accountId);
    setActiveRuns((count) => count + 1);
    try {
      await executeLaunch(accountId, account ? getAccountLabel(account) : "账号");
    } finally {
      setActiveRuns((count) => Math.max(0, count - 1));
    }
  }

  async function handleBulkLaunch() {
    if (selectedBulkAccounts.length === 0) {
      addLog("error", "请先选择一批账号。");
      return;
    }

    const accountsToLaunch = selectedBulkAccounts.slice(0, MAX_BULK_LAUNCH_ACCOUNTS);
    const startedAt = Date.now();
    addLog(
      "info",
      `批量上号开始：第 ${bulkStartIndex}-${bulkRangeEnd} 个账号，最多并发 ${BULK_LAUNCH_CONCURRENCY} 个，错峰 ${BULK_LAUNCH_STAGGER_MS}ms。`
    );
    try {
      await runBulkLaunchQueue(accountsToLaunch, async (account) => {
        setActiveRuns((count) => count + 1);
        try {
          await executeLaunch(account.id, getAccountLabel(account));
        } finally {
          setActiveRuns((count) => Math.max(0, count - 1));
        }
      });
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      addLog("success", `批量上号完成：已处理 ${accountsToLaunch.length} 个账号，用时 ${elapsedSeconds}s。`);
      selectNextBulkRange();
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "批量上号调度失败。");
    }
  }

  function toggleBulkSelection(accountId: string) {
    setSelectedBulkAccountIds((current) => toggleBulkAccountSelection(current, accountId));
  }

  function handleSelectBulkCount(count: number) {
    const nextCount = Math.min(MAX_BULK_LAUNCH_ACCOUNTS, Math.max(1, count));
    setBulkCount(nextCount);
    setSelectedBulkAccountIds(selectBulkAccountRange(visibleAccounts, bulkStartIndex, nextCount));
  }

  function handleSelectBulkStart(startIndex: number) {
    const nextStartIndex = normalizeBulkStartIndex(startIndex);
    setBulkStartIndex(nextStartIndex);
    setSelectedBulkAccountIds(selectBulkAccountRange(visibleAccounts, nextStartIndex, bulkCount));
  }

  function selectCurrentBulkRange() {
    setSelectedBulkAccountIds(selectBulkAccountRange(visibleAccounts, bulkStartIndex, bulkCount));
  }

  function selectNextBulkRange() {
    const nextStartIndex = bulkStartIndex + bulkCount;
    if (nextStartIndex > visibleAccounts.length) {
      setBulkStartIndex(Math.max(1, visibleAccounts.length));
      setSelectedBulkAccountIds([]);
      return;
    }

    setBulkStartIndex(nextStartIndex);
    setSelectedBulkAccountIds(selectBulkAccountRange(visibleAccounts, nextStartIndex, bulkCount));
  }

  function normalizeBulkStartIndex(startIndex: number): number {
    if (visibleAccounts.length === 0) {
      return 1;
    }

    return Math.min(visibleAccounts.length, Math.max(1, Math.floor(startIndex)));
  }

  async function handleOpenSession(accountId: string) {
    if (!bridge) return;
    const account = accounts.find((item) => item.id === accountId);
    setAccountRunFeedback(accountId, { level: "info", message: "正在打开会话" });
    try {
      await bridge.openSession(accountId);
      const feedback = describeSessionOpenFeedback();
      setAccountRunFeedback(accountId, feedback);
      addLog("success", `${account ? getAccountLabel(account) : "账号"}：已打开该账号的独立会话窗口。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "打开会话失败。";
      setAccountRunFeedback(accountId, { level: "error", message });
      addLog("error", `${account ? getAccountLabel(account) : "账号"}：${message}`);
    }
  }

  function getAccountLabel(account: AccountSummary): string {
    const rowNumber = visibleAccounts.findIndex((item) => item.id === account.id) + 1;
    const prefix = rowNumber > 0 ? `#${rowNumber}` : "账号";
    return `${prefix} ${account.usernamePreview}`;
  }

  async function handleDeleteAccount(accountId: string) {
    if (!bridge || !confirm("只删除账号记录，不自动删除浏览器 Profile。确认删除？")) return;
    await bridge.deleteAccount(accountId);
    setSelectedAccountId(undefined);
    setAccountDetails((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
    addLog("success", "账号记录已删除。");
    await refresh();
  }

  async function handleResetAccountProfile(accountId: string) {
    if (
      !bridge ||
      !confirm("确认用浏览器模板重置这个账号的 Profile？这会删除该账号当前浏览器会话、Cookie 和已保存的网页登录状态。")
    ) {
      return;
    }

    const account = accounts.find((item) => item.id === accountId);
    try {
      const result = (await bridge.resetAccountProfileFromTemplate(accountId)) as { profilePath: string };
      setAccountRunFeedback(accountId, { level: "success", message: "已套用浏览器模板" });
      addLog("success", `${account ? getAccountLabel(account) : "账号"}：已用模板重置 Profile。路径：${result.profilePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重置 Profile 失败。";
      setAccountRunFeedback(accountId, { level: "error", message });
      addLog("error", `${account ? getAccountLabel(account) : "账号"}：${message}`);
    }
  }

  async function handleDeletePlatform(platform: Platform) {
    if (
      !bridge ||
      !confirm(`确认删除平台「${platform.name}」？该平台下的账号记录也会一起删除，浏览器 Profile 文件不会自动删除。`)
    ) {
      return;
    }

    await bridge.deletePlatform(platform.id);
    if (selectedPlatformId === platform.id) {
      setSelectedPlatformId(undefined);
      setSelectedAccountId(undefined);
      setSelectedBulkAccountIds([]);
    }
    addLog("success", `平台已删除：${platform.name}`);
    await refresh();
  }

  function parseFlowSteps(value: string) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [type, ...locatorParts] = line.split("|");
        return {
          type: type.trim() as "click" | "fill_username" | "fill_password",
          locator: locatorParts.join("|").trim()
        };
      });
  }

  if (!unlocked) {
    return (
      <UnlockScreen
        masterPassword={masterPassword}
        error={unlockError}
        isUnlocking={isUnlocking}
        onMasterPasswordChange={setMasterPassword}
        onSubmit={handleUnlock}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>账号工作台</strong>
        <span>账号库：已解锁</span>
        <span>浏览器服务：本地</span>
        <span>运行中：{activeRuns}</span>
      </header>

      <aside className="platform-pane">
        <section className="side-section target-section">
          <h2>目标网址</h2>
          <div className="url-box">{currentTargetUrl}</div>
          <div className="side-meta">
            <span>{selectedPlatform ? selectedPlatform.name : "全部账号"}</span>
            <span>{visibleAccounts.length} 个账号</span>
          </div>
          <button type="button" onClick={() => void handleCreateDolaGooglePasswordPreset()}>初始化 Dola</button>
        </section>

        <section className="side-section import-section">
          <h2>导入账号文件</h2>
          <input
            value={credentialFilePath}
            onChange={(event) => setCredentialFilePath(event.target.value)}
            placeholder="本地账号文件路径"
          />
          <button type="button" onClick={() => void handlePickCredentialFile()}>选择本机文件</button>
          <button className="primary-action" type="button" onClick={() => void handleImportDolaGoogleAccounts()}>导入</button>
        </section>

        <section className="side-section">
          <div className="pane-title">
            <span>平台</span>
            <span>{platforms.length}</span>
          </div>
          <button className={!selectedPlatformId ? "platform-item active" : "platform-item"} onClick={() => setSelectedPlatformId(undefined)}>
            <span>全部账号</span>
            <small>{accounts.length} 个本地账号</small>
          </button>
          {platforms.map((platform) => (
            <div key={platform.id} className={platform.id === selectedPlatformId ? "platform-row active" : "platform-row"}>
              <button className="platform-select" onClick={() => setSelectedPlatformId(platform.id)}>
                <span>{platform.name}</span>
                <small>{platform.allowedOrigins[0]}</small>
              </button>
              <button
                className="platform-delete danger"
                type="button"
                onClick={() => void handleDeletePlatform(platform)}
                aria-label={`删除平台 ${platform.name}`}
              >
                删除
              </button>
            </div>
          ))}
        </section>

        <details className="advanced-panel">
          <summary>高级配置</summary>
          <button type="button" onClick={() => void handleCreateDolaPreset()}>创建手动会话预设</button>
          <div className="stacked-form">
            <h2>浏览器模板</h2>
            <p className="hint">在模板窗口里安装并固定扩展。打开账号浏览器时，如果账号 Profile 缺少模板扩展，会先自动套用模板。</p>
            <button type="button" onClick={() => void handleOpenProfileTemplate()}>打开模板浏览器</button>
            <button type="button" onClick={() => void handleOpenCameraPermissions()}>打开系统相机权限</button>
          </div>
          <form className="stacked-form" onSubmit={handleCreatePlatform}>
            <h2>添加平台</h2>
            <input required value={platformForm.name} onChange={(event) => setPlatformForm({ ...platformForm, name: event.target.value })} placeholder="平台名称" />
            <input required value={platformForm.baseUrl} onChange={(event) => setPlatformForm({ ...platformForm, baseUrl: event.target.value })} placeholder="首页 URL" />
            <input required value={platformForm.loginUrl} onChange={(event) => setPlatformForm({ ...platformForm, loginUrl: event.target.value })} placeholder="登录页 URL" />
            <input required value={platformForm.allowedOrigins} onChange={(event) => setPlatformForm({ ...platformForm, allowedOrigins: event.target.value })} placeholder="允许域名，用英文逗号分隔" />
            <button type="submit">保存平台</button>
          </form>
        </details>
      </aside>

      <section className="account-pane">
        <div className="pane-title">
          <span>{selectedPlatform ? selectedPlatform.name : "全部账号"}</span>
          <span>{visibleAccounts.length} 个账号</span>
        </div>
        <div className="bulk-toolbar">
          <strong>当前批次 {visibleAccounts.length > 0 ? `${bulkStartIndex}-${bulkRangeEnd}` : "0-0"}</strong>
          <label className="compact-field">
            <span>起始序号</span>
            <input
              min={1}
              max={Math.max(1, visibleAccounts.length)}
              type="number"
              value={bulkStartIndex}
              onChange={(event) => handleSelectBulkStart(Number(event.target.value))}
            />
          </label>
          <label className="compact-field">
            <span>每批数量</span>
            <input
              min={1}
              max={MAX_BULK_LAUNCH_ACCOUNTS}
              type="number"
              value={bulkCount}
              onChange={(event) => handleSelectBulkCount(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={selectCurrentBulkRange} disabled={visibleAccounts.length === 0}>
            选择当前批
          </button>
          <button type="button" onClick={selectNextBulkRange} disabled={visibleAccounts.length === 0}>
            下一批
          </button>
          <span className="bulk-range-note">已选择 {selectedBulkAccountIds.length}/{MAX_BULK_LAUNCH_ACCOUNTS}</span>
          <button type="button" onClick={() => setSelectedBulkAccountIds([])} disabled={selectedBulkAccountIds.length === 0}>
            清空
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => void handleBulkLaunch()}
            disabled={selectedBulkAccountIds.length === 0}
          >
            批量上号
          </button>
        </div>
        <div className="table">
          <div className="table-row table-head account-grid">
            <span>选择</span>
            <span>序号</span>
            <span>操作</span>
            <span>邮箱</span>
            <span>密码</span>
            <span>验证密钥</span>
            <span>地区/年份</span>
            <span>当前步骤</span>
          </div>
          {visibleAccounts.map((account, index) => (
            <div
              key={account.id}
              className={account.id === selectedAccountId ? "table-row account-grid selected" : "table-row account-grid"}
              onClick={() => setSelectedAccountId(account.id)}
            >
              <span>
                <input
                  className="row-check"
                  type="checkbox"
                  aria-label={`选择第 ${index + 1} 个账号`}
                  checked={selectedBulkAccountIds.includes(account.id)}
                  disabled={!selectedBulkAccountIds.includes(account.id) && selectedBulkAccountIds.length >= MAX_BULK_LAUNCH_ACCOUNTS}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggleBulkSelection(account.id)}
                />
              </span>
              <span className="row-index">{index + 1}</span>
              <span className="row-actions">
                <button className="primary-action" onClick={(event) => { event.stopPropagation(); void handleLaunch(account.id); }}>上号</button>
                <button onClick={(event) => { event.stopPropagation(); void handleOpenSession(account.id); }}>会话</button>
                <button className="danger" onClick={(event) => { event.stopPropagation(); void handleDeleteAccount(account.id); }}>删</button>
              </span>
              <span className="secret-cell">{accountDetails[account.id]?.username ?? account.usernamePreview}</span>
              <span className="secret-cell">{accountDetails[account.id]?.password ?? "读取中"}</span>
              <span className="secret-cell">{accountDetails[account.id]?.secretMeta.verificationSecret ?? "-"}</span>
              <span>{[accountDetails[account.id]?.secretMeta.region, accountDetails[account.id]?.secretMeta.year].filter(Boolean).join(" / ") || "-"}</span>
              <span className={accountFeedback[account.id] ? `inline-status ${accountFeedback[account.id].level}` : undefined}>
                {accountFeedback[account.id]?.message ?? account.status}
              </span>
            </div>
          ))}
          {visibleAccounts.length === 0 && <div className="empty-state">暂无账号。先添加平台、适配器和账号。</div>}
        </div>

        <section className="run-panel">
          <div className="pane-title">
            <span>步骤反馈</span>
            <span>{selectedBulkAccounts.length}</span>
          </div>
          {selectedBulkAccounts.length === 0 ? (
            <p className="hint">选择账号后，这里显示每个账号卡在哪一步。</p>
          ) : (
            <div className="run-list">
              {selectedBulkAccounts.map((account) => (
                <div key={account.id} className="run-card">
                  <strong>{getAccountLabel(account)}</strong>
                  <span className={accountFeedback[account.id] ? `inline-status ${accountFeedback[account.id].level}` : "inline-status"}>
                    {accountFeedback[account.id]?.message ?? "等待开始"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="account-detail-panel">
          <h2>当前账号</h2>
          {selectedAccount ? (
            <div className="detail-box">
              <strong>{getAccountLabel(selectedAccount)}</strong>
              <span>邮箱: {selectedAccountDetail?.username ?? selectedAccount.usernamePreview}</span>
              <span>密码: {selectedAccountDetail?.password ?? "读取中"}</span>
              <span>验证密钥: {selectedAccountDetail?.secretMeta.verificationSecret ?? "-"}</span>
              <span>短码: {selectedAccountDetail?.secretMeta.extraCode ?? "-"}</span>
              <span>地区/年份: {[selectedAccountDetail?.secretMeta.region, selectedAccountDetail?.secretMeta.year].filter(Boolean).join(" / ") || "-"}</span>
              <span>标签: {selectedAccount.tags.join(", ") || "-"}</span>
              <span>Profile: {selectedAccount.profileId.slice(0, 8)}</span>
              <span>状态: {accountFeedback[selectedAccount.id]?.message ?? selectedAccount.status}</span>
              <button type="button" onClick={() => void handleResetAccountProfile(selectedAccount.id)}>用模板重置 Profile</button>
              <button className="danger" type="button" onClick={() => void handleDeleteAccount(selectedAccount.id)}>删除记录</button>
            </div>
          ) : (
            <p className="hint">选择一个账号查看详情，或在下方添加新账号。</p>
          )}
        </section>

        <details className="advanced-panel">
          <summary>高级配置</summary>
          <form className="stacked-form" onSubmit={handleSaveAdapter}>
            <h2>登录适配器</h2>
            <select disabled={!selectedPlatformId} value={adapterForm.authMode} onChange={(event) => setAdapterForm({ ...adapterForm, authMode: event.target.value as LoginAuthMode })}>
              <option value="password">账号密码自动填充</option>
              <option value="manual_session">手动登录 / OAuth 会话复用</option>
              <option value="flow_password">多步骤密码登录</option>
            </select>
            <input disabled={!selectedPlatformId || isManualSessionAdapter || isFlowPasswordAdapter} value={adapterForm.usernameLocator} onChange={(event) => setAdapterForm({ ...adapterForm, usernameLocator: event.target.value })} placeholder="账号字段 selector" />
            <input disabled={!selectedPlatformId || isManualSessionAdapter || isFlowPasswordAdapter} value={adapterForm.passwordLocator} onChange={(event) => setAdapterForm({ ...adapterForm, passwordLocator: event.target.value })} placeholder="密码字段 selector" />
            <input disabled={!selectedPlatformId || isManualSessionAdapter || isFlowPasswordAdapter} value={adapterForm.submitLocator} onChange={(event) => setAdapterForm({ ...adapterForm, submitLocator: event.target.value })} placeholder="登录按钮 selector" />
            <input disabled={!selectedPlatformId || !isManualSessionAdapter} value={adapterForm.startLocator} onChange={(event) => setAdapterForm({ ...adapterForm, startLocator: event.target.value })} placeholder="可选：登录入口 selector" />
            <textarea disabled={!selectedPlatformId || !isFlowPasswordAdapter} value={adapterForm.flowSteps} onChange={(event) => setAdapterForm({ ...adapterForm, flowSteps: event.target.value })} placeholder={"多步骤流程，每行：类型|selector\nclick|button:has-text('Google')\nfill_username|input[type='email']\nfill_password|input[type='password']"} />
            <input disabled={!selectedPlatformId} value={adapterForm.successSelector} onChange={(event) => setAdapterForm({ ...adapterForm, successSelector: event.target.value })} placeholder="成功 selector" />
            <input disabled={!selectedPlatformId} value={adapterForm.failureSelector} onChange={(event) => setAdapterForm({ ...adapterForm, failureSelector: event.target.value })} placeholder="失败 selector" />
            <input disabled={!selectedPlatformId} value={adapterForm.manualSelector} onChange={(event) => setAdapterForm({ ...adapterForm, manualSelector: event.target.value })} placeholder="验证码/2FA selector" />
            {isManualSessionAdapter && <p className="hint">此模式用普通 Chrome 打开独立 Profile，不自动填写 Google 密码。首次登录后复用该 Profile。</p>}
            {isFlowPasswordAdapter && <p className="hint">此模式会自动填入账号密码。包含 Google 登录域名的平台会用普通 Chrome 填表，后续验证由你手动完成。</p>}
            <button disabled={!selectedPlatformId} type="submit">保存适配器</button>
          </form>

          <form className="stacked-form" onSubmit={handleCreateAccount}>
            <h2>添加账号</h2>
            <input disabled={!selectedPlatformId} required value={accountForm.displayName} onChange={(event) => setAccountForm({ ...accountForm, displayName: event.target.value })} placeholder="显示名称" />
            <input disabled={!selectedPlatformId} required value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} placeholder="账号/邮箱" />
            <input disabled={!selectedPlatformId} required={isFlowPasswordAdapter || !isManualSessionAdapter} type="password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder="密码，手动会话可留空" />
            <input disabled={!selectedPlatformId} value={accountForm.verificationSecret} onChange={(event) => setAccountForm({ ...accountForm, verificationSecret: event.target.value })} placeholder="验证密钥 / 2FA Secret" />
            <input disabled={!selectedPlatformId} value={accountForm.extraCode} onChange={(event) => setAccountForm({ ...accountForm, extraCode: event.target.value })} placeholder="短码 / 附加字段" />
            <input disabled={!selectedPlatformId} value={accountForm.region} onChange={(event) => setAccountForm({ ...accountForm, region: event.target.value })} placeholder="地区" />
            <input disabled={!selectedPlatformId} value={accountForm.year} onChange={(event) => setAccountForm({ ...accountForm, year: event.target.value })} placeholder="年份" />
            <input disabled={!selectedPlatformId} value={accountForm.tags} onChange={(event) => setAccountForm({ ...accountForm, tags: event.target.value })} placeholder="标签，用英文逗号分隔" />
            <button disabled={!selectedPlatformId} type="submit">保存账号</button>
          </form>
        </details>
      </section>

      <section className="log-pane">
        <div className="pane-title">
          <span>运行日志</span>
          <span>{logs.length}</span>
        </div>
        {logs.length === 0 ? <span className="hint">暂无运行日志。</span> : logs.map((log) => (
          <div key={log.id} className={`log-line ${log.level}`}>
            <time>{log.at}</time>
            <span>{log.message}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
