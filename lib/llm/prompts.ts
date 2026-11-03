import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Prompt texts live in /prompts as UTF-8 .txt files and are read only on the
 * server; nothing under /prompts is served or bundled for the browser. Each
 * file ends with exactly one newline, which is not part of the prompt. Names
 * are this fixed list: never derive a name from request data. Editing a file
 * changes model behaviour, so bump promptConfigVersion (tests pin the digest). */
export const promptNames = [
  "system/preamble", "system/retry",
  "coach/prewrite", "coach/nudge", "coach/issue", "coach/clarify", "coach/polish", "coach/check", "coach/express", "coach/chat",
  "judge/evaluate", "judge/compare", "judge/finish", "judge/review",
  "quick/followup", "quick/check",
] as const;
export type PromptName = typeof promptNames[number];

const root = path.join(process.cwd(), "prompts");
let loaded: ReadonlyMap<PromptName, string> | undefined;

function load(): ReadonlyMap<PromptName, string> {
  const texts = new Map<PromptName, string>();
  for (const name of promptNames) {
    let raw: string;
    // Never echo prompt text or the absolute path in errors.
    try { raw = readFileSync(path.join(root, `${name}.txt`), "utf8"); } catch { throw new Error(`Prompt file missing: ${name}`); }
    if (!raw.endsWith("\n") || raw.endsWith("\n\n") || raw.includes("\r")) throw new Error(`Prompt file must end with one LF and contain no CR: ${name}`);
    texts.set(name, raw.slice(0, -1));
  }
  return texts;
}

export function prompt(name: PromptName): string {
  loaded ??= load();
  return loaded.get(name)!;
}

/** Replace every {{key}}; a missing or unused variable is a programming error. */
export function renderPrompt(name: PromptName, vars: Record<string, string>): string {
  const used = new Set<string>();
  const text = prompt(name).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!Object.hasOwn(vars, key)) throw new Error(`Prompt variable missing: ${name}.${key}`);
    used.add(key);
    return vars[key];
  });
  for (const key of Object.keys(vars)) if (!used.has(key)) throw new Error(`Prompt variable unused: ${name}.${key}`);
  return text;
}

/** Content digest of all prompt files, for version pinning in tests. */
export function promptsDigest(): string {
  const hash = createHash("sha256");
  for (const name of promptNames) hash.update(`${name}\0${prompt(name)}\0`);
  return hash.digest("hex");
}
