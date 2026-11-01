"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/prototype/session-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Copy kept separate so the difference between persisted drafts and unsent
 * messages is testable without mounting Next navigation or a portal. */
export function DeepLeaveNotice({ saving, draftDirty, message = "", onCancel, onLeave }: {
  saving: boolean; draftDirty: boolean; message?: string; onCancel: () => void; onLeave: () => void;
}) {
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">教练输入框里还有未发送的文字，仅保留在当前页面，不会随作文草稿保存。离开将丢弃这些文字；可以返回发送或先复制。</p>
    {message && <textarea readOnly aria-label="未发送文字（可复制）" value={message} className="min-h-24 w-full rounded-md border p-2 text-sm" />}
    {draftDirty && <p className="text-sm">继续离开前会先保存作文和提纲；保存失败会留在当前页面。</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onCancel}>留在这里</Button><Button disabled={saving} onClick={onLeave}>{saving ? "正在保存作文…" : draftDirty ? "保存作文并离开，不发送聊天" : "离开，舍弃未发送文字"}</Button></div>
  </div>;
}

/** Capture all page links, including portalled FinishDialog links, before Next's
 * router handlers. New tabs keep this page intact; reload/close uses beforeunload. */
export function DeepLeaveGuard() {
  const { actions, composerDraft } = useSession(), router = useRouter();
  const current = useRef(actions);
  const [destination, setDestination] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const navigate = async (href: string, discardComposer: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true);
    try {
      if (current.current.hasUnsaved() && !await current.current.save()) return;
      if (discardComposer) current.current.setComposerDraft("");
      setDestination(null);
      const url = new URL(href, window.location.href);
      if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
      else window.location.assign(url.href);
    } finally { inFlight.current = false; setSaving(false); }
  };
  const navRef = useRef(navigate);
  useLayoutEffect(() => { current.current = actions; navRef.current = navigate; });
  useEffect(() => {
    const capture = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (!["http:", "https:"].includes(url.protocol) || (url.pathname === window.location.pathname && url.search === window.location.search && url.origin === window.location.origin)) return;
      if (!current.current.hasUnsentComposer() && !current.current.hasUnsaved()) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (current.current.hasUnsentComposer()) setDestination(url.href);
      else void navRef.current(url.href, false);
    };
    document.addEventListener("click", capture, true);
    return () => document.removeEventListener("click", capture, true);
  }, []);
  return <Dialog open={destination !== null} onOpenChange={open => { if (!open && !saving) setDestination(null); }}><DialogContent>
    <DialogHeader><DialogTitle>还有未发送的教练文字</DialogTitle></DialogHeader>
    <DeepLeaveNotice message={composerDraft} saving={saving} draftDirty={actions.hasUnsaved()} onCancel={() => setDestination(null)} onLeave={() => { if (destination) void navigate(destination, true); }} />
  </DialogContent></Dialog>;
}
