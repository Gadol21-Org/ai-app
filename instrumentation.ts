/** Runs once when the server starts: bring the database schema up to date. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrate } = await import("drizzle-orm/mysql2/migrator");
  const { getDb } = await import("@/lib/db");
  // Relative to the working directory: the repo root in dev, /app in the image.
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("database migrations applied");
}
