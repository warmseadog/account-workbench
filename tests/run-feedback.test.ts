import { describe, expect, it } from "vitest";
import { describeLoginRunFeedback, describeSessionOpenFeedback } from "../src/renderer/run-feedback";
import type { LoginRun, LoginRunStep } from "../src/shared/models";

function step(message: string): LoginRunStep {
  return {
    at: "2026-06-23T00:00:00.000Z",
    status: "filling_credentials",
    message
  };
}

function run(status: LoginRun["status"], requiresManual = false, steps: LoginRunStep[] = []): LoginRun {
  return {
    id: "run-1",
    accountId: "account-1",
    status,
    startedAt: "2026-06-23T00:00:00.000Z",
    steps,
    requiresManual
  };
}

describe("run feedback", () => {
  it("turns manual handoff into an operator-visible account status", () => {
    expect(describeLoginRunFeedback(run("manual_handoff", true))).toEqual({
      level: "info",
      message: "已打开，等待你在浏览器完成登录"
    });
  });

  it("shows when credentials were already filled before manual verification", () => {
    expect(describeLoginRunFeedback(run("manual_handoff", true, [step("已填写密码字段。")]))).toEqual({
      level: "info",
      message: "已填入账号密码，等待你完成验证"
    });
  });

  it("describes opened sessions without exposing internal status codes", () => {
    expect(describeSessionOpenFeedback()).toEqual({
      level: "success",
      message: "会话窗口已打开"
    });
  });
});
