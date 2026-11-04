import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { privacyNotice } from "@/lib/privacy/notice";
export const metadata = { title: "隐私说明" };
export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl px-5 py-10"><Link href="/login" className="text-sm underline">返回登录</Link><h1 className="page-heading my-6">隐私说明</h1><article className="space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-medium [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-5"><ReactMarkdown remarkPlugins={[remarkGfm]}>{privacyNotice()}</ReactMarkdown></article></main>;
}
