import "./scripts/load-env";
import { defineConfig } from "drizzle-kit";
import { getDatabaseConfig } from "./lib/db/config";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: getDatabaseConfig().filename },
  strict: true,
  verbose: true,
});
