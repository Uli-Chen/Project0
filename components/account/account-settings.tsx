"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/shell/app-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusButton, type AsyncStatus } from "@/components/ui/status-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentUser } from "@/lib/auth/types";
import { examTime } from "@/lib/learning/summary";

async function send(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "保存失败，请重试。");
  return data;
}

export function AccountSettings({ user, tutorV2Enabled = false, privacyVisible = false }: { user: CurrentUser; tutorV2Enabled?: boolean; privacyVisible?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileBusy) return;
    setProfileBusy(true); setProfileMessage(""); setProfileError("");
    try { await send("/api/profile", { name }, "PATCH"); setName(name.trim()); setProfileMessage("已保存"); router.refresh(); }
    catch (error) { setProfileError(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setProfileBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordBusy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setPasswordMessage(""); setPasswordError("");
    if (values.get("newPassword") !== values.get("confirmPassword")) { setPasswordError("两次输入的新密码不一致。"); return; }
    setPasswordBusy(true);
    try {
      await send("/api/auth/password", { currentPassword: values.get("currentPassword"), newPassword: values.get("newPassword") });
      form.reset(); setPasswordMessage("密码已更新，其他设备已退出登录");
    } catch (error) { setPasswordError(error instanceof Error ? error.message : "修改失败，请重试。"); }
    finally { setPasswordBusy(false); }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteBusy) return;
    const values = new FormData(event.currentTarget);
    setDeleteBusy(true); setDeleteError("");
    try {
      await send("/api/auth/account", { password: values.get("password"), confirmation: values.get("confirmation") }, "DELETE");
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Clear cached private page state after deleting the account.
      window.location.assign("/register");
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "删除失败，请重试。"); setDeleteBusy(false); }
  }

  return <div className="max-w-3xl">
    <div className="flex items-center gap-3"><Avatar name={user.name} size={36} /><div className="min-w-0"><h1 className="page-heading truncate">{user.name}</h1><p className="meta truncate">{user.email}</p></div></div>
    <div className="mt-8 border-t">
      <Row title="名字">
        <form onSubmit={saveProfile} className="flex flex-wrap items-start gap-2">
          <Input id="account-name" aria-label="名字" name="name" disabled={profileBusy} autoComplete="nickname" value={name} onChange={(event) => { setName(event.target.value); setProfileMessage(""); }} required maxLength={40} className="max-w-xs" />
          <StatusButton type="submit" variant="outline" status={statusOf(profileBusy, profileMessage, profileError)} successLabel="已保存" errorLabel="重试" disabled={name.trim() === user.name && !profileMessage}>保存</StatusButton>
          <div className="basis-full"><Status error={profileError} /><span role="status" className="sr-only">{profileMessage}</span></div>
        </form>
      </Row>
      <Row title="目标与节奏">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{user.profile.onboardingCompleted ? <span className="font-medium text-foreground tabular-nums">{user.profile.target} 分 · 每周 {user.profile.perWeek} 次 · {examTime(user.profile).timeLeft}</span> : "未设置"}</p>
          <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>{user.profile.onboardingCompleted ? "修改" : "设置"}<ChevronRight /></Link>
        </div>
      </Row>
      {tutorV2Enabled && <Row title="学习偏好"><LearningPreferences user={user} /></Row>}
      {privacyVisible && <Row title="隐私"><Link href="/privacy" className="text-sm underline">隐私说明</Link></Row>}
      <Row title="外观"><ThemeToggle /></Row>
      <Row title="密码">
        <form onSubmit={changePassword} onChange={() => setPasswordMessage("")} className="flex max-w-sm flex-col gap-3">
          <Field label="当前密码" htmlFor="current-password"><Input id="current-password" name="currentPassword" disabled={passwordBusy} type="password" autoComplete="current-password" required maxLength={128} /></Field>
          <Field label="新密码" htmlFor="new-password"><Input id="new-password" name="newPassword" disabled={passwordBusy} type="password" autoComplete="new-password" required minLength={10} maxLength={128} placeholder="至少 10 个字符" /></Field>
          <Field label="再次输入新密码" htmlFor="confirm-password"><Input id="confirm-password" name="confirmPassword" disabled={passwordBusy} type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></Field>
          <Status error={passwordError} message={passwordMessage} />
          <StatusButton type="submit" variant="outline" className="self-start" status={statusOf(passwordBusy, passwordMessage, passwordError)} successLabel="已更新" errorLabel="重试">更新密码</StatusButton>
        </form>
      </Row>
      <Row title="删除账户">
        <p className="text-sm text-muted-foreground">永久删除账户、作文、对话、练习记录和记忆，无法恢复。</p>
        {!deleteOpen ? <Button variant="destructive" className="mt-3" onClick={() => setDeleteOpen(true)}><Trash2 />删除账户</Button> : (
          <form onSubmit={deleteAccount} className="mt-4 flex max-w-sm flex-col gap-3">
            <Field label="密码" htmlFor="delete-password"><Input id="delete-password" name="password" disabled={deleteBusy} type="password" autoComplete="current-password" required maxLength={128} /></Field>
            <Field label="输入「删除我的账户」确认" htmlFor="delete-confirmation"><Input id="delete-confirmation" name="confirmation" disabled={deleteBusy} required pattern="删除我的账户" autoComplete="off" /></Field>
            <Status error={deleteError} />
            <div className="flex flex-wrap gap-2"><StatusButton variant="destructive" type="submit" status={deleteBusy ? "pending" : "idle"} pendingLabel="正在删除">永久删除</StatusButton><Button variant="ghost" disabled={deleteBusy} onClick={() => { setDeleteOpen(false); setDeleteError(""); }}>取消</Button></div>
          </form>
        )}
      </Row>
    </div>
  </div>;
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-3 border-b py-7 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8"><h2 className="pt-1.5 text-sm font-medium">{title}</h2><div className="min-w-0">{children}</div></section>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><Label htmlFor={htmlFor} className="text-[14px] font-normal text-muted-foreground">{label}</Label>{children}</div>;
}

function statusOf(busy: boolean, message: string, error: string): AsyncStatus {
  return busy ? "pending" : error ? "error" : message ? "success" : "idle";
}

function Status({ error, message }: { error?: string; message?: string }) {
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (message) return <p role="status" className="flex items-center gap-1.5 text-sm text-good"><Check className="size-4" />{message}</p>;
  return null;
}


function LearningPreferences({ user }: { user: CurrentUser }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(""); setMessage("");
    try { await send("/api/profile", { explainLanguage: data.get("explainLanguage"), nudgesDefault: data.get("nudgesDefault") === "on" }, "PATCH"); setMessage("已保存，下次新请求生效。段落提醒偏好仅影响新建练习。"); }
    catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  return <form onSubmit={save} onChange={() => setMessage("")} className="flex max-w-sm flex-col gap-4"><label className="text-sm">讲解语言<select name="explainLanguage" defaultValue={user.profile.explainLanguage === "en" ? "en" : "zh"} disabled={busy} className="ml-3 rounded border bg-background p-2"><option value="zh">中文</option><option value="en">English</option></select></label><label className="text-sm"><input type="checkbox" name="nudgesDefault" defaultChecked={user.profile.nudgesDefault !== false} disabled={busy} className="mr-2" />新建练习开启段落提醒</label><Status error={error} message={message} /><StatusButton type="submit" variant="outline" className="self-start" status={statusOf(busy, message, error)} successLabel="已保存" errorLabel="重试">保存偏好</StatusButton></form>;
}
