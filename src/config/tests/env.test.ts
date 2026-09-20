import { expect, test } from "vitest";
import { aiConfig, firstPlatformAdminConfig, deploymentSettingsFromEnv, emailConfig, oidcCredentials, telegramConfig } from "../env";

test("notice channels default to memory and real providers require complete configuration", () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  expect(telegramConfig(env)).toEqual({ provider: "memory", webhookSecret: null });
  expect(emailConfig(env)).toEqual({ provider: "memory" });
  expect(() => telegramConfig({ ...env, TELEGRAM_PROVIDER: "telegram" })).toThrow();
  expect(() => emailConfig({ ...env, EMAIL_PROVIDER: "smtp" })).toThrow();
  expect(telegramConfig({
    ...env,
    TELEGRAM_PROVIDER: "telegram", TELEGRAM_BOT_USERNAME: "meetups_bot", TELEGRAM_BOT_TOKEN: "123:test",
    TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
  })).toEqual({ provider: "telegram", token: "123:test", webhookSecret: "test-webhook-secret" });
  expect(emailConfig({ ...env, EMAIL_PROVIDER: "smtp", SMTP_URL: "smtps://smtp.example.test:465", EMAIL_FROM: "meetups@example.test" }))
    .toEqual({ provider: "smtp", url: "smtps://smtp.example.test:465" });
  expect(() => emailConfig({ ...env, EMAIL_PROVIDER: "smtp", SMTP_URL: "https://example.test", EMAIL_FROM: "meetups@example.test" })).toThrow();
});

const firstPlatformEnvironment: NodeJS.ProcessEnv = {
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

test("real AI needs its environment credential while endpoint and model defaults stay non-secret", () => {
  expect(aiConfig({ NODE_ENV: "test", AI_PROVIDER: "chat-completion", AI_API_KEY: "example-key" }))
    .toEqual({ provider: "chat-completion", apiKey: "example-key" });
  expect(() => aiConfig({ NODE_ENV: "test", AI_PROVIDER: "chat-completion" })).toThrow();
  expect(() => aiConfig({ NODE_ENV: "test", AI_PROVIDER: "unsupported" })).toThrow();
  expect(deploymentSettingsFromEnv({ NODE_ENV: "test", AI_BASE_URL: "https://chat.example/v1", AI_MODEL: "scout-model",
    AI_EXTRACTION_MODEL: "small-model", TELEGRAM_BOT_USERNAME: "meetups_bot", EMAIL_FROM: "notices@example.test", TIME_ZONE: "Asia/Singapore",
    AI_API_KEY: "must-not-be-copied", TELEGRAM_BOT_TOKEN: "must-not-be-copied" }))
    .toEqual({ aiBaseUrl: "https://chat.example/v1", scoutModel: "scout-model", extractionModel: "small-model",
      telegramBotUsername: "meetups_bot", emailFrom: "notices@example.test", timeZone: "Asia/Singapore" });
  expect(deploymentSettingsFromEnv({ NODE_ENV: "test" })).toMatchObject({ extractionModel: "gpt-5.6-luna", timeZone: "UTC" });
});

test("first Platform Admin configuration ignores retired bootstrap lists and Organisation Admin fields", () => {
  const config = firstPlatformAdminConfig({ ...firstPlatformEnvironment, BOOTSTRAP_DEPARTMENTS: '["Finance"]',
    BOOTSTRAP_SITES: '["Harbour"]', BOOTSTRAP_ORGANISATION_ADMIN_EMAIL: "extra@example.test", BOOTSTRAP_ORGANISATION_ADMIN_NAME: "Extra" });
  expect(config?.organisation).toEqual({ slug: "ministry-a", name: "Ministry A" });
  expect(config).not.toHaveProperty("organisationAdmin");
  expect(config?.oidc).toMatchObject({ credentialRef: null });
  expect(firstPlatformAdminConfig({ NODE_ENV: "test" })).toBeUndefined();
});

test("OIDC secrets stay in the environment mapping while first setup carries only the reference", () => {
  const config = firstPlatformAdminConfig({ ...firstPlatformEnvironment, BOOTSTRAP_OIDC_CREDENTIAL_REF: "owner-sso" });
  expect(config?.oidc).toMatchObject({ credentialRef: "owner-sso" });
  expect(config?.oidc).not.toHaveProperty("clientSecret");
  expect(oidcCredentials({ NODE_ENV: "test", OIDC_CREDENTIALS: '{"owner-sso":"test-only-secret"}' })).toEqual({ "owner-sso": "test-only-secret" });
  expect(oidcCredentials({ NODE_ENV: "test" })).toEqual({});
  expect(() => firstPlatformAdminConfig({ ...firstPlatformEnvironment, BOOTSTRAP_OIDC_CLIENT_SECRET: "legacy-secret" })).toThrow("OIDC_CREDENTIALS");
  expect(() => oidcCredentials({ NODE_ENV: "test", OIDC_CREDENTIALS: "bad test-only-secret" })).toThrow("OIDC_CREDENTIALS must be a JSON object");
});
