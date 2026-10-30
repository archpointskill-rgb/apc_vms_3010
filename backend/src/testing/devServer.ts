/**
 * Runs the whole API against a throwaway Postgres, with sign-in checking
 * switched off, so the screens can be tried without a Supabase project.
 *
 *   npx tsx src/testing/devServer.ts
 *
 * FOR TRYING THINGS OUT ONLY. It accepts any well-formed user id as a sign-in
 * and is excluded from the production build. `npm start` is the real server.
 */
import { startHarness } from "./harness";

const PORT = Number(process.env.DEV_PORT ?? 4000);
const harness = await startHarness(Number(process.env.DEV_PG_PORT ?? 54342));

// Re-serve the app on a fixed port so the web app's proxy can find it.
const { createApp } = await import("../app");
const { TestVerifier } = await import("./harness");
createApp(harness.db, new TestVerifier(), ["http://localhost:5173"]).listen(PORT);

const admin = await harness.addUser("archpointskill@gmail.com", "Pratap Singh");
const reception = await harness.addUser("reception@archpoint.in", "Front Desk");
const amitUser = await harness.addUser("amit@archpoint.in", "Amit Khandelwal");
const manager = await harness.addUser("manager@archpoint.in", "Office Manager");

await harness.setRole(reception, "reception");
await harness.setRole(amitUser, "host", await harness.hostId("Amit Khandelwal"));
await harness.setRole(manager, "manager");

console.log("\n  DEMO SERVER — sign-in checking is OFF. Never use this for real visitors.\n");
console.log(`  API            http://localhost:${PORT}`);
console.log(`  admin token    ${admin}`);
console.log(`  reception      ${reception}`);
console.log(`  host (Amit)    ${amitUser}`);
console.log(`  manager        ${manager}\n`);

process.on("SIGINT", async () => { await harness.stop(); process.exit(0); });
