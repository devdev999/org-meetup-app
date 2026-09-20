import { expect, test } from "vitest";
import { aiConfig, bootstrapConfig, emailConfig, telegramConfig } from "../env";

test("notice channels default to memory and real providers require complete configuration", () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  expect(telegramConfig(env)).toEqual({ provider: "memory", botUsername: null, webhookSecret: null });
  expect(emailConfig(env)).toEqual({ provider: "memory" });
  expect(() => telegramConfig({ ...env, TELEGRAM_PROVIDER: "telegram" })).toThrow();
  expect(() => emailConfig({ ...env, EMAIL_PROVIDER: "smtp" })).toThrow();
  expect(telegramConfig({
    ...env,
    TELEGRAM_PROVIDER: "telegram", TELEGRAM_BOT_USERNAME: "meetups_bot", TELEGRAM_BOT_TOKEN: "123:test",
    TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
  })).toEqual({ provider: "telegram", botUsername: "meetups_bot", token: "123:test", webhookSecret: "test-webhook-secret" });
  expect(emailConfig({ ...env, EMAIL_PROVIDER: "smtp", SMTP_URL: "smtps://smtp.example.test:465", EMAIL_FROM: "meetups@example.test" }))
    .toEqual({ provider: "smtp", url: "smtps://smtp.example.test:465", from: "meetups@example.test" });
  expect(() => emailConfig({ ...env, EMAIL_PROVIDER: "smtp", SMTP_URL: "https://example.test", EMAIL_FROM: "meetups@example.test" })).toThrow();
});

const bootstrapEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  BOOTSTRAP_ORGANISATION_SLUG: "ministry-a",
  BOOTSTRAP_ORGANISATION_NAME: "Ministry A",
  BOOTSTRAP_OIDC_ISSUER: "https://issuer.example",
  BOOTSTRAP_OIDC_CLIENT_ID: "meetups",
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL: "pat@ministry-a.example",
  BOOTSTRAP_PLATFORM_ADMIN_NAME: "Pat Platform",
};

test("AI defaults to an in-memory provider without endpoint credentials", () => {
  expect(aiConfig({ NODE_ENV: "test" })).toEqual({ provider: "memory" });
});

test("AI accepts a configured chat-completion endpoint", () => {
  expect(aiConfig({
    NODE_ENV: "test",
    AI_PROVIDER: "chat-completion",
    AI_BASE_URL: "https://chat.example/v1",
    AI_API_KEY: "example-key",
    AI_MODEL: "interest-model",
  })).toEqual({
    provider: "chat-completion",
    baseUrl: "https://chat.example/v1",
    apiKey: "example-key",
    model: "interest-model",
  });
});

test.each([
  { AI_PROVIDER: "unsupported" },
  { AI_BASE_URL: "not-a-url" },
  { AI_BASE_URL: "ftp://chat.example/v1" },
  { AI_API_KEY: " " },
  { AI_MODEL: "" },
])("AI refuses incomplete or invalid chat-completion configuration: %j", (invalid) => {
  expect(() => aiConfig({
    NODE_ENV: "test",
    AI_PROVIDER: "chat-completion",
    AI_BASE_URL: "https://chat.example/v1",
    AI_API_KEY: "example-key",
    AI_MODEL: "interest-model",
    ...invalid,
  })).toThrow();
});

test("AI extraction can use a separately configured model", () => {
  expect(aiConfig({ NODE_ENV: "test", AI_PROVIDER: "chat-completion", AI_BASE_URL: "https://chat.example/v1", AI_API_KEY: "example-key",
    AI_MODEL: "canonical-model", AI_EXTRACTION_MODEL: "small-model" })).toMatchObject({ model: "canonical-model", extractionModel: "small-model" });
});

test("bootstrap parses Department and Site lists from JSON, preserving commas inside names", () => {
  const config = bootstrapConfig({
    ...bootstrapEnvironment,
    BOOTSTRAP_DEPARTMENTS: '[" Finance ", "Policy, Planning and Research"]',
    BOOTSTRAP_SITES: '["Harbour House"]',
  });

  expect(config?.organisation).toEqual({
    slug: "ministry-a",
    name: "Ministry A",
    departments: ["Finance", "Policy, Planning and Research"],
    sites: ["Harbour House"],
  });
});

test("bootstrap lists are optional, and an unconfigured deployment skips bootstrap", () => {
  expect(bootstrapConfig(bootstrapEnvironment)?.organisation).toMatchObject({ departments: [], sites: [] });
  expect(bootstrapConfig({ NODE_ENV: "test" })).toBeUndefined();
});

test.each([
  ["BOOTSTRAP_DEPARTMENTS", "not JSON"],
  ["BOOTSTRAP_DEPARTMENTS", '[" "]'],
  ["BOOTSTRAP_SITES", "{}"],
  ["BOOTSTRAP_SITES", "[42]"],
])("bootstrap rejects invalid names in %s: %s", (variable, value) => {
  expect(() => bootstrapConfig({ ...bootstrapEnvironment, [variable]: value })).toThrow(variable);
});

test("bootstrap configures an Organisation Admin separately from the Platform Admin", () => {
  expect(bootstrapConfig({
    ...bootstrapEnvironment,
    BOOTSTRAP_ORGANISATION_ADMIN_EMAIL: "olivia@ministry-a.example",
    BOOTSTRAP_ORGANISATION_ADMIN_NAME: "Olivia Admin",
  })?.organisationAdmin).toEqual({ email: "olivia@ministry-a.example", name: "Olivia Admin" });
  expect(() => bootstrapConfig({ ...bootstrapEnvironment, BOOTSTRAP_ORGANISATION_ADMIN_EMAIL: "olivia@ministry-a.example" })).toThrow();
  expect(() => bootstrapConfig({ ...bootstrapEnvironment, BOOTSTRAP_ORGANISATION_ADMIN_NAME: "Olivia Admin" })).toThrow();
});
