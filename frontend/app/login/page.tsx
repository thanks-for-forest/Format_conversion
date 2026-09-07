"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendCode, verifyCode } from "../lib/api";

const COPY = {
  title: "邮箱验证码登录",
  emailLabel: "邮箱：",
  sendCode: "发送验证码",
  sending: "发送中…",
  codeLabel: "验证码：",
  login: "登录",
  verifying: "验证中…",
  resend: "重新发送",
  devHint: "开发环境：验证码打印在后端服务日志中（[dev-mailer]）",
  backHome: "返回首页",
} as const;

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  width: "100%",
  boxSizing: "border-box",
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "10px 24px",
  borderRadius: 8,
  border: "none",
  background: disabled ? "#c7cdd4" : "#2563eb",
  color: "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
});

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await sendCode(email);
      setCodeSent(true);
      setMessage("验证码已发送，请查收邮件");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError("");
    try {
      await verifyCode(email, code);
      // 登录成功：跳回首页，重新拉取登录态
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setVerifying(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 420,
        margin: "80px auto",
        padding: 32,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22, margin: "0 0 16px" }}>{COPY.title}</h1>

      <form onSubmit={handleSend}>
        <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
          {COPY.emailLabel}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={codeSent}
            placeholder="you@example.com"
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
        {!codeSent && (
          <button type="submit" disabled={sending || !email} style={buttonStyle(sending || !email)}>
            {sending ? COPY.sending : COPY.sendCode}
          </button>
        )}
      </form>

      {codeSent && (
        <form onSubmit={handleVerify} style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
            {COPY.codeLabel}
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6 位数字"
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          <button type="submit" disabled={verifying || code.length !== 6} style={buttonStyle(verifying || code.length !== 6)}>
            {verifying ? COPY.verifying : COPY.login}
          </button>
          <button
            type="button"
            onClick={() => handleSend({ preventDefault() {} } as FormEvent)}
            disabled={sending}
            style={{ ...buttonStyle(sending), background: "none", color: "#2563eb", marginLeft: 12 }}
          >
            {COPY.resend}
          </button>
        </form>
      )}

      {message && <p style={{ color: "#059669", fontSize: 13 }}>{message}</p>}
      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 16 }}>{COPY.devHint}</p>
      <Link href="/" style={{ fontSize: 13, color: "#2563eb" }}>
        {COPY.backHome}
      </Link>
    </main>
  );
}