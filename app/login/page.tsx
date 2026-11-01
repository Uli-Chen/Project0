import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getCurrentUser } from "@/lib/auth/server";
import { safeLoginDestination } from "@/lib/auth/redirect";
import { isRegistrationEnabled } from "@/lib/auth/config";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const safeNext = safeLoginDestination(next);
  return <AuthFrame><AuthForm mode="login" next={safeNext} registrationEnabled={isRegistrationEnabled()} /></AuthFrame>;
}
