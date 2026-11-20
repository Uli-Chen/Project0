import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// 字体本地托管：界面用 Geist，题目与作答用 Newsreader（见 app/fonts/LICENSE.md）

const newsreader = localFont({
  src: [
    { path: "./fonts/newsreader.woff2", weight: "200 800", style: "normal" },
    { path: "./fonts/newsreader-italic.woff2", weight: "200 800", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "AugWrite", template: "%s · AugWrite" },
  description: "IELTS 写作练习与教练",
};

export const runtime = "nodejs";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} ${newsreader.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)').matches;try{var t=localStorage.getItem('p0:theme');d.classList.toggle('dark',t==='dark'||(t==='system'&&m))}catch(e){d.classList.remove('dark')}})()` }} />
      </head>
      <body><TooltipProvider delay={300}>{children}</TooltipProvider><Toaster position="bottom-right" /></body>
    </html>
  );
}
