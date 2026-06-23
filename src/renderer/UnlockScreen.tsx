import type { FormEvent } from "react";

interface UnlockScreenProps {
  masterPassword: string;
  error?: string;
  isUnlocking: boolean;
  onMasterPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function UnlockScreen({
  masterPassword,
  error,
  isUnlocking,
  onMasterPasswordChange,
  onSubmit
}: UnlockScreenProps) {
  return (
    <main className="unlock-screen">
      <form className="unlock-panel" onSubmit={onSubmit}>
        <div>
          <p className="eyebrow">LOCAL VAULT</p>
          <h1>账号工作台</h1>
          <p>输入本地主密码解锁账号库。密码只用于本机解密，不会上传。</p>
        </div>
        <input
          type="password"
          autoFocus
          minLength={8}
          value={masterPassword}
          onChange={(event) => onMasterPasswordChange(event.target.value)}
          placeholder="本地主密码"
        />
        <button type="submit" disabled={isUnlocking}>
          {isUnlocking ? "解锁中..." : "解锁"}
        </button>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <p className="hint">首次使用时，请记住这个主密码；后续需要用同一个密码解密已保存账号。</p>
      </form>
    </main>
  );
}
