import { expect, test } from "vitest";
import { bootstrapConfig } from "../env";

const bootstrapEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  BOOTSTRAP_ORGANISATION_SLUG: "ministry-a",
  BOOTSTRAP_ORGANISATION_NAME: "Ministry A",
  BOOTSTRAP_OIDC_ISSUER: "https://issuer.example",
  BOOTSTRAP_OIDC_CLIENT_ID: "meetups",
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL: "pat@ministry-a.example",
  BOOTSTRAP_PLATFORM_ADMIN_NAME: "Pat Platform",
};

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
