// Restrict post-login redirects to this app and normalize dot segments before
// the browser navigates.
export function safeLoginDestination(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  try {
    const destination = new URL(value, "https://app.invalid");
    if (destination.origin !== "https://app.invalid" || destination.pathname.startsWith("/api/") || ["/login", "/register"].includes(destination.pathname)) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch { return "/"; }
}
