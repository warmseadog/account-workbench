# Account Workbench MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Electron + React MVP for encrypted account storage and isolated browser-profile login runs.

**Architecture:** The app uses React for the workbench UI and Electron main as the local backend. Sensitive operations stay in main-process services: SQLite persistence, credential encryption, profile management, adapter validation, and Playwright launch orchestration.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Node `crypto`, Node `sqlite`, Playwright persistent contexts.

---

### Task 1: Project Skeleton And Test Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/test/setup.ts`

- [ ] Create package scripts for `test`, `typecheck`, `build`, and `dev`.
- [ ] Install dependencies.
- [ ] Run `npm test` and confirm the test runner starts.

### Task 2: Security And Domain Unit Tests

**Files:**
- Create: `tests/crypto-vault.test.ts`
- Create: `tests/profile-manager.test.ts`
- Create: `tests/login-adapter.test.ts`

- [ ] Write failing tests for encrypted credential envelopes.
- [ ] Write failing tests for deterministic isolated profile paths.
- [ ] Write failing tests for allowed-origin validation and safe selector validation.
- [ ] Run `npm test` and confirm tests fail because modules are not implemented yet.

### Task 3: Core Domain Implementation

**Files:**
- Create: `src/shared/models.ts`
- Create: `src/main/crypto/vault.ts`
- Create: `src/main/profiles/profile-manager.ts`
- Create: `src/main/adapters/login-adapter.ts`

- [ ] Implement model types.
- [ ] Implement AES-256-GCM encrypted credential envelopes.
- [ ] Implement isolated profile path generation.
- [ ] Implement adapter validation and allowed-origin checks.
- [ ] Run `npm test` and confirm the security/domain tests pass.

### Task 4: SQLite Store And Services

**Files:**
- Create: `src/main/storage/sqlite-store.ts`
- Create: `src/main/services/workbench-service.ts`
- Create: `tests/workbench-service.test.ts`

- [ ] Write failing tests for creating platforms, adapters, and encrypted accounts.
- [ ] Implement SQLite schema initialization.
- [ ] Implement service methods that never return decrypted passwords to the renderer.
- [ ] Run `npm test` and confirm persistence tests pass.

### Task 5: Login Runner Shell

**Files:**
- Create: `src/main/runs/login-runner.ts`
- Create: `tests/login-runner.test.ts`

- [ ] Write failing tests for run-state transitions and manual handoff states.
- [ ] Implement a browser-controller interface and a Playwright controller.
- [ ] Implement login runner orchestration with origin checks before filling credentials.
- [ ] Run `npm test` and confirm runner tests pass without launching a real browser.

### Task 6: Electron Bridge And UI

**Files:**
- Create: `src/main/electron-main.ts`
- Create: `src/main/preload.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles.css`
- Create: `src/renderer/vite-env.d.ts`

- [ ] Implement typed IPC for platforms, accounts, adapters, runs, and logs.
- [ ] Implement workbench layout: left platform list, middle account table, right action panel, bottom logs.
- [ ] Use empty-state UI instead of mock data.
- [ ] Keep destructive actions explicit and local.
- [ ] Run `npm run typecheck` and `npm run build`.

### Task 7: Dev Runner And Verification

**Files:**
- Create: `scripts/dev-electron.mjs`
- Modify: `package.json`

- [ ] Implement `npm run dev` to start Vite and Electron together.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Report remaining runtime limitations, especially that real Playwright login needs an installed Chrome channel or bundled browser install.

## Self-Review

- Spec coverage: credential encryption, local storage, isolated profiles, allowed origins, manual handoff, logs, and UI layout are all represented in tasks.
- Scope check: team collaboration, cloud sync, proxy pools, and captcha bypass are excluded.
- Placeholder scan: no task depends on an undefined external system except package installation and the user's local browser channel.
