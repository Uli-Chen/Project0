import { once } from "node:events";
import { register } from "../../instrumentation";
import { getSession, saveSession } from "../../lib/db/queries/sessions";
import { admitModelCall, withModelAdmission } from "../../lib/llm/admission";
import { withSessionLock } from "../../lib/pipeline/lock";

async function main() {
  const [mode, user, attempt] = process.argv.slice(2);
  if (mode === "recover") {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    process.send?.("recovered");
    return;
  }
  try {
    await withSessionLock(`${user}:${attempt}`, () => withModelAdmission(user, async () => {
      admitModelCall();
      const command = once(process, "message");
      process.send?.("ready");
      if ((await command)[0] === "write") {
        const state = getSession(user, attempt)!;
        state.drafts.original = "late write";
        saveSession(user, state);
      }
    }));
    process.send?.("released");
  } catch (error) {
    process.send?.(error && typeof error === "object" && "code" in error ? error.code : String(error));
  }
}

void main().finally(() => process.disconnect?.());
