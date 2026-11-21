export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try { const { cleanCallPayloads } = await import("./lib/llm/payloads"); cleanCallPayloads(); } catch { console.error("llm payload cleanup failed"); }
  const { recoverQuickOperations } = await import("./lib/pipeline/quick-model");
  const { recoverInflightCalls } = await import("./lib/llm/calls");
  const { pruneExpiredExecutions } = await import("./lib/db/execution-leases");
  const recover = () => {
    const now = new Date().toISOString();
    try { recoverQuickOperations(now); } catch { console.error("quick operation recovery failed; reservations retained"); }
    try { recoverInflightCalls(now); } catch { console.error("llm_calls recovery failed; reservations retained"); }
    try {
      for (const scope of ["session", "review", "model"] as const) pruneExpiredExecutions(scope);
    } catch { console.error("Execution lease cleanup failed"); }
  };
  recover();
  setInterval(recover, 30_000).unref();
  try {
    const { getDb } = await import("./lib/db/client");
    const { scanUnscannedUsers } = await import("./lib/db/migrate-0.4");
    scanUnscannedUsers(getDb().$client);
  } catch (error) {
    // Missing migrations/catalog or a broken record must not prevent startup.
    // Submission checks treat a missing legacy_scan row as unknown exposure.
    console.error("0.4 startup scan failed; unscanned users retain unknown exposure", error);
  }
}
