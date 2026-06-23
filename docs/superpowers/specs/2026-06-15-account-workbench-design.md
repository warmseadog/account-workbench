# Account Workbench MVP Design

## Goal

Build a local-first account workbench for accounts the user owns or is authorized to manage. The MVP stores encrypted account credentials locally, opens an isolated browser profile per account, fills configured login fields, and hands control back to the user for captcha, SMS, 2FA, or any site security challenge.

## Boundaries

- The tool never bypasses captcha, SMS, 2FA, risk checks, or other site security mechanisms.
- The tool never uploads account credentials, cookies, profile data, or logs to a third-party service.
- Passwords are never stored or logged in plaintext.
- Automation only runs on configured allowed origins for the selected platform.
- Each account gets an independent browser profile directory.

## Product Shape

The MVP is an Electron desktop app with a React renderer, local TypeScript backend in the Electron main process, SQLite persistence, field-level credential encryption, and Playwright browser automation. This keeps all sensitive data on the user's machine while still allowing a web-style operations console.

## Core Modules

- React UI: platform list, account table, account detail panel, top status bar, bottom run log.
- Secure bridge: typed IPC exposed through preload; renderer never receives decrypted passwords.
- SQLite store: stores platform, account metadata, encrypted credentials, adapters, profiles, runs, and audit logs.
- Crypto vault: derives a local encryption key from a master password and encrypts sensitive fields with AES-256-GCM.
- Platform adapter: validates login selectors and allowed origins before automation.
- Profile manager: creates deterministic isolated `userDataDir` paths per account.
- Browser controller: launches Playwright persistent browser contexts and executes configured login steps.
- Audit logger: records actions and errors with redacted metadata only.

## MVP Data Flow

1. User creates a platform and login adapter.
2. User saves account username and password.
3. Main process encrypts credentials before writing to SQLite.
4. User clicks "上号".
5. Login runner creates a `LoginRun`, opens the account profile, verifies current origin is allowed, fills fields, and clicks submit.
6. If login succeeds, the profile persists cookies locally.
7. If captcha, SMS, 2FA, password error, selector failure, or unknown state appears, automation stops and the UI shows a manual handoff message.

## Security Decisions

- MVP uses master-password-derived encryption with `scrypt` and AES-256-GCM.
- The encrypted envelope includes salt, nonce, auth tag, and ciphertext.
- Logs and run steps use structured redaction and do not include usernames, passwords, cookies, tokens, or localStorage.
- Keychain support is a planned enhancement; the MVP key lifecycle is explicit unlock per app session.
- SQLite database is local-only; SQLCipher can be added after the MVP if full-database encryption is required.

## UI

The first screen is the workbench itself, not a landing page. It has a quiet operations-tool layout:

- Top status bar: local vault state, browser service state, active run count.
- Left platform list: platform names, account counts, issue counts.
- Middle account table: account name, tags, state, last used time, row actions.
- Right account panel: selected account details, profile state, "上号", "打开会话", "编辑", "删除".
- Bottom log: timestamp, platform, account display name, step, result, safe message.

## Explicit Non-Goals

- No cloud sync.
- No team account sharing.
- No proxy pool.
- No captcha solving.
- No SMS receiving.
- No 2FA bypass.
- No account resale, batch abuse, or authorization system copied from other products.
