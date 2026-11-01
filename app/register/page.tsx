import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getCurrentUser } from "@/lib/auth/server";
import { isRegistrationEnabled } from "@/lib/auth/config";

export const metadata: Metadata = { title: "创建账户" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  if (!isRegistrationEnabled()) {
    return <AuthFrame>
      <h1 className="page-heading">暂未开放注册</h1>
      <p className="mt-4 text-sm text-muted-foreground">目前暂停创建新账户，已有账户可正常登录。</p>
      <Link href="/login" className="mt-6 inline-block text-sm font-medium underline underline-offset-4">返回登录</Link>
    </AuthFrame>;
  }
  return <AuthFrame><AuthForm mode="register" /></AuthFrame>;
}
