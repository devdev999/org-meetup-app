import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/application/lib/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5439/org_meetup",
  },
});
