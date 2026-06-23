import type { LoginRun } from "../shared/models";

export type RunFeedbackLevel = "info" | "error" | "success";

export interface RunFeedback {
  level: RunFeedbackLevel;
  message: string;
}

export function describeLoginRunFeedback(
  run: Pick<LoginRun, "status" | "requiresManual"> & Partial<Pick<LoginRun, "steps">>
): RunFeedback {
  if (run.status === "succeeded") {
    return { level: "success", message: "登录完成" };
  }

  if (run.status === "manual_handoff" || run.requiresManual) {
    if (run.steps?.some((step) => step.message.includes("已填写密码字段"))) {
      return { level: "info", message: "已填入账号密码，等待你完成验证" };
    }

    return { level: "info", message: "已打开，等待你在浏览器完成登录" };
  }

  if (run.status === "failed") {
    return { level: "error", message: "上号失败" };
  }

  return { level: "info", message: "正在处理" };
}

export function describeSessionOpenFeedback(): RunFeedback {
  return { level: "success", message: "会话窗口已打开" };
}
