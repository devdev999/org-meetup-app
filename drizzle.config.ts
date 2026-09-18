import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/config/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/application/lib/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: databaseUrl() },
});
