/** Runs once when the server starts: bring the database up to date and start the cleanup. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrate } = await import("drizzle-orm/mysql2/migrator");
  const { getDb } = await import("@/lib/db");
  // Relative to the working directory: the repo root in dev, /app in the image.
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("database migrations applied");

  const { setNotifier } = await import("@/lib/approvals/notifier");
  const { pushNotifier } = await import("@/lib/notifications/notifier");
  setNotifier(pushNotifier);

  const { startScheduler } = await import("@/lib/schedules/runner");
  await startScheduler();

  const { purgeExpiredThreads, retentionDays } = await import("@/lib/retention");
  const purge = async () => {
    try {
      const n = await purgeExpiredThreads();
      if (n > 0) console.log(`retention: removed ${n} expired conversation(s)`);
    } catch (error) {
      console.error("retention cleanup failed", error);
    }
  };
  if (retentionDays() > 0) {
    await purge();
    setInterval(purge, 60 * 60 * 1000).unref();
  }
}
