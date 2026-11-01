"use client";

import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

export function AuthForm({ mode, next = "/", registrationEnabled = false }: { mode: "login" | "register"; next?: string; registrationEnabled?: boolean }) {
  const register = mode === "register";
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    if (register && password !== values.get("confirmPassword")) { setError("两次输入的密码不一致，请检查。"); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.get("email"), password, ...(register ? { name: values.get("name") } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "暂时无法完成，请重试。");
      window.location.assign(register ? "/onboarding" : next);
    } catch (err) { setError(err instanceof Error ? err.message : "连接失败，请检查网络后重试。"); setBusy(false); }
  }

  return <>
    <h1 className="page-heading">{register ? "创建账户" : "登录"}</h1>
    <form onSubmit={submit} className="mt-7 space-y-5">
      {register && <label className="block text-xs font-medium text-muted-foreground" htmlFor="name">名字<input id="name" name="name" autoComplete="nickname" required maxLength={40} className={fieldClass} /></label>}
      <label className="block text-xs font-medium text-muted-foreground" htmlFor="email">邮箱<input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="you@example.com" className={fieldClass} /></label>
      <div><label className="block text-xs font-medium text-muted-foreground" htmlFor="password">密码</label><div className="relative"><input id="password" name="password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} minLength={register ? 10 : 1} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={register ? "至少 10 个字符" : undefined} className={`${fieldClass} pr-12`} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "隐藏密码" : "显示密码"} className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground">{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
      {register && <label className="block text-xs font-medium text-muted-foreground" htmlFor="confirmPassword">再次输入密码<input id="confirmPassword" name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} className={fieldClass} /></label>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="default" size="lg" disabled={busy} className="w-full">{busy ? <><LoaderCircle className="animate-spin" />{register ? "正在创建…" : "正在登录…"}</> : <>{register ? "创建账户" : "登录"}<ArrowRight /></>}</Button>
    </form>
    {(register || registrationEnabled) && <p className="mt-6 text-center text-sm text-muted-foreground">{register ? "已有账户？" : "没有账户？"} <Link href={register ? "/login" : "/register"} className="font-medium text-foreground underline underline-offset-4">{register ? "登录" : "创建账户"}</Link></p>}
  </>;
}

const fieldClass = "mt-1.5 h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40";
