# Bundled Chrome Extension Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make packaged Chrome extensions visible, automatically used during account login, and non-blocking when missing.

**Architecture:** Keep extension discovery in the main process and expose a small status object to both login runs and the renderer. Login runners record the same status in `LoginRun.steps`, so operator logs show whether bundled extensions were available without preventing login.

**Tech Stack:** Electron IPC, TypeScript, React renderer, Vitest.

---

### Task 1: Model And Resource Status

**Files:**
- Modify: `src/shared/models.ts`
- Create: `src/main/runs/chrome-extension-status.ts`
- Modify: `src/main/runtime-resources.ts`
- Test: `tests/runtime-resources.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that expect `getBundledChromeExtensionStatus(root)` to return `available` with a count and `missing` when no manifests exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/runtime-resources.test.ts`
Expected: FAIL because `getBundledChromeExtensionStatus` does not exist.

- [ ] **Step 3: Implement status helpers**

Define `BundledChromeExtensionStatus` in shared models, add a main-process helper that maps extension paths into Chinese operator messages, and export `getBundledChromeExtensionStatus`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/runtime-resources.test.ts`
Expected: PASS.

### Task 2: Add Status To Login Runs

**Files:**
- Modify: `src/main/runs/login-runner.ts`
- Modify: `src/main/runs/manual-session-runner.ts`
- Modify: `src/main/runs/login-launcher.ts`
- Modify: `src/main/electron-main.ts`
- Test: `tests/login-runner.test.ts`
- Test: `tests/manual-session-runner.test.ts`

- [ ] **Step 1: Write failing tests**

Expect automated and manual login runs to include `chromeExtensionStatus` and a first-step message that says bundled extensions are loaded or not detected.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/login-runner.test.ts tests/manual-session-runner.test.ts`
Expected: FAIL because runners do not accept or record extension status.

- [ ] **Step 3: Implement runner wiring**

Pass the status from `electron-main.ts` into `AccountLoginLauncher`, `LoginRunner`, and `ManualSessionRunner`. Set `run.chromeExtensionStatus` and add an informational step before opening Chrome.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/login-runner.test.ts tests/manual-session-runner.test.ts`
Expected: PASS.

### Task 3: Show Status In The Operator UI

**Files:**
- Modify: `src/main/preload.ts`
- Modify: `src/main/electron-main.ts`
- Modify: `src/renderer/App.tsx`
- Test: `tests/operator-workbench-view.test.tsx`

- [ ] **Step 1: Write failing UI test**

Expect `OperatorWorkbenchView` to render the bundled extension status in the top operation surface.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/operator-workbench-view.test.tsx`
Expected: FAIL because the prop and markup do not exist.

- [ ] **Step 3: Implement IPC and UI rendering**

Add `extensions:status` IPC, expose it as `getChromeExtensionStatus`, load it during refresh, and render `插件 已内置/未检测到` in the topbar metrics.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/operator-workbench-view.test.tsx`
Expected: PASS.

### Task 4: Verification And Commit

**Files:**
- All modified files above.

- [ ] **Step 1: Run full checks**

Run: `npm test` and `npm run typecheck`.
Expected: all tests and type checks pass.

- [ ] **Step 2: Review git status**

Run: `git status -sb`.
Expected: only the intended implementation files are changed.

- [ ] **Step 3: Commit and push**

Run: `git add <changed files>`, `git commit -m "Add bundled Chrome extension status"`, and `git push origin main`.
Expected: GitHub `main` contains the implementation after the baseline commit.
