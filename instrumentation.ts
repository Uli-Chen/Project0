export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
