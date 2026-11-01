import { commitQuickMutation } from "../../lib/pipeline/quick";
process.send?.("ready");
process.once("message", () => {
  try {
    const result = commitQuickMutation("u", process.argv[2], { action: "continueDeep", explicitNew: false, requestId: crypto.randomUUID() });
    process.send?.({ childId: result.deepSession!.id });
  } catch (error) { process.send?.({ error: String(error) }); }
  finally { process.disconnect(); }
});
