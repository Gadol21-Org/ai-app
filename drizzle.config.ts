import { defineConfig } from "drizzle-kit";

// `npm run db:generate` after editing lib/db/schema.ts writes a new SQL migration
// into ./drizzle. Migrations are applied automatically when the server starts.
export default defineConfig({
  dialect: "mysql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
