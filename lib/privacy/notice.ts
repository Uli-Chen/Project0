import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
export function privacyNotice() {
  const source = readFileSync(join(process.cwd(), "docs/privacy/privacy_notice.md"), "utf8");
  return source.split(/^---\s*$/m)[1].trim();
}
