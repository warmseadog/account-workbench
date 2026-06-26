# 2FA.CN Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each account's 2FA secret in plaintext in the operator table and automatically open, fill, and submit https://2fa.cn/ during launch.

**Architecture:** Reuse the existing encrypted `secretMeta.verificationSecret` field. Extend `AccountSecrets` so launch code receives the secret, and extend the browser session abstraction with a helper-page operation that can create a 2FA.CN tab inside the same account Chrome profile.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Playwright/CDP Chrome session control.

---

### Task 1: UI Plaintext Secret Display

**Files:**
- Modify: `tests/operator-workbench-view.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write the failing UI test**

Add expectations that the operator table contains `2FA 密钥` and the full plaintext `otp-secret`, and that selected account details show `2FA 密钥: otp-secret` without requiring the hidden login-info details block.

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `npm test -- tests/operator-workbench-view.test.tsx`
Expected: FAIL because the current table does not render the 2FA secret column and detail text is still hidden under the old label.

- [ ] **Step 3: Implement minimal UI changes**

Add a `2FA 密钥` table column with `accountDetails[account.id]?.secretMeta.verificationSecret ?? "未配置"`, and show the selected account's full `2FA 密钥` in the detail panel. Keep passwords inside the existing collapsible login-info area.

- [ ] **Step 4: Run the UI test to verify it passes**

Run: `npm test -- tests/operator-workbench-view.test.tsx`
Expected: PASS.

### Task 2: Launch-Time 2FA.CN Automation

**Files:**
- Modify: `tests/login-runner.test.ts`
- Modify: `tests/workbench-service.test.ts`
- Modify: `src/shared/models.ts`
- Modify: `src/main/services/workbench-service.ts`
- Modify: `src/main/runs/login-runner.ts`

- [ ] **Step 1: Write failing runner and service tests**

Add a runner test proving `verificationSecret` opens `https://2fa.cn/`, fills the `2FA Secret` textarea/input, clicks submit, records redacted progress, and never logs the secret. Add a service test proving `getAccountSecrets()` returns `verificationSecret`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/login-runner.test.ts tests/workbench-service.test.ts`
Expected: FAIL because `AccountSecrets` does not include `verificationSecret` and `BrowserSession` has no helper-page method yet.

- [ ] **Step 3: Implement minimal launch automation**

Add `verificationSecret?: string` to `AccountSecrets`. Have `WorkbenchService.getAccountSecrets()` include `secretMeta.verificationSecret`. Add optional `openTotpHelper?(secret: string): Promise<void>` to `BrowserSession`, call it after the account profile opens when a secret exists, and implement it in `PlaywrightBrowserSession` with a new page that navigates to `https://2fa.cn/`, fills the first visible textarea/input with the secret, and clicks a submit button.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/login-runner.test.ts tests/workbench-service.test.ts tests/operator-workbench-view.test.tsx`
Expected: PASS.

### Task 3: Final Verification

**Files:**
- Verify all changed TypeScript and UI files.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Full tests**

Run: `npm test`
Expected: PASS.
