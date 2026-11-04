"use client";

import { useRef, useState, type FormEvent } from "react";

const pill = "inline-flex h-10 items-center justify-center rounded-full px-5 text-[15px] font-medium whitespace-nowrap transition-colors disabled:opacity-60";

export function DeveloperAccess({ hasAccess }: { hasAccess: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = input.current?.value ?? "";
    if (!password) { setError("Enter the password."); input.current?.focus(); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/preview/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      // /preview is a route handler serving a standalone document, so it needs a full navigation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (response.ok) { window.location.assign("/preview"); return; }
      setError(response.status === 429 ? "Too many attempts. Try again later." : "Incorrect password.");
    } catch {
      setError("Couldn’t reach the server. Try again.");
    }
    setBusy(false);
    if (input.current) { input.current.value = ""; input.current.focus(); }
  }

  async function signOut() {
    setBusy(true);
    await fetch("/api/preview/logout", { method: "POST" }).catch(() => null);
    window.location.reload();
  }

  if (hasAccess) {
    return <div className="flex items-center gap-2">
      <button type="button" onClick={signOut} disabled={busy} className={`${pill} text-[#50565f] hover:text-[#15171a]`}>Sign out</button>
      <a href="/preview" className={`${pill} bg-[#15171a] text-white hover:bg-[#2a2e34]`}>Open preview</a>
    </div>;
  }

  if (!open) {
    return <button type="button" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }} className={`${pill} shadow-[inset_0_0_0_1px_#e6e8eb] hover:shadow-[inset_0_0_0_1px_#c9cdd3]`}>Developer access</button>;
  }

  return <form onSubmit={submit} className="flex flex-col items-end gap-2" noValidate>
    <div className="flex items-center gap-2">
      <label htmlFor="preview-password" className="sr-only">Developer password</label>
      <input ref={input} id="preview-password" name="password" type="password" autoComplete="current-password" placeholder="Developer password" maxLength={200} disabled={busy}
        aria-invalid={error ? true : undefined} aria-describedby={error ? "preview-error" : undefined}
        className="h-10 w-56 rounded-full bg-[#f5f6f7] px-4 text-[15px] outline-none placeholder:text-[#7a808a] focus-visible:ring-2 focus-visible:ring-[#2f4fa8]" />
      <button type="submit" disabled={busy} className={`${pill} bg-[#15171a] text-white hover:bg-[#2a2e34]`}>{busy ? "Checking…" : "Enter"}</button>
    </div>
    <p id="preview-error" role="alert" className="min-h-5 text-[14px] text-[#b42318]">{error}</p>
  </form>;
}
