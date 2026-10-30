import { SupabaseVerifier } from "./auth/verifier";
import { createApp } from "./app";
import { config } from "./config";
import { createPool, query } from "./db";

const db = createPool(config.databaseUrl);

try {
  const [row] = await query<{ hosts: number; staff: number }>(
    db,
    "select (select count(*)::int from public.hosts) as hosts, (select count(*)::int from public.staff) as staff"
  );
  console.log(`[api] database ready: ${row?.hosts ?? 0} hosts, ${row?.staff ?? 0} staff accounts`);
  if ((row?.staff ?? 0) === 0) {
    console.log("[api] No staff yet. Create the first user in Supabase > Authentication > Users; that account becomes the Admin.");
  }
} catch (e) {
  console.error("[api] Could not reach the database. Check DATABASE_URL in backend/.env.");
  console.error("     ", (e as Error).message);
  process.exit(1);
}

const verifier = new SupabaseVerifier(config.supabase.url, config.supabase.publishableKey);

createApp(db, verifier, [...config.corsOrigins]).listen(config.port, () => {
  console.log(`[api] ArchPoint Visitors API on http://localhost:${config.port}`);
});
