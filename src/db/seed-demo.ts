import { Pool } from "pg";
import { MemoryAi } from "../adapters/ai/memory";
import { ControllableClock } from "../adapters/clock/controllable";
import { MemoryEmail } from "../adapters/email/memory";
import { FakeIdentity } from "../adapters/identity/fake";
import { MemoryTelegram } from "../adapters/telegram/memory";
import { createApplication } from "../application";
import { localDemoSettings, seedDemo } from "./demo-seed";

const settings = localDemoSettings(process.env, process.argv.slice(2));
const pool = new Pool({ connectionString: settings.databaseUrl });
try {
  const clock = new ControllableClock(new Date());
  const app = createApplication({ pool, clock, identity: new FakeIdentity(), ai: new MemoryAi(),
    telegram: new MemoryTelegram(), email: new MemoryEmail() });
  const result = await seedDemo(app, clock, settings.appUrl);
  console.log(result.created ? "DSTA demo created. All Members and gatherings are fictional." : "DSTA demo already exists. No seed data changed.");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Open ${settings.appUrl} and choose DSTA demo. Member: aisha.rahman@dsta.example.test. Admin: maya.tan@dsta.example.test.`);
} finally {
  await pool.end();
}
