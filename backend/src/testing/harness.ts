import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import type { TokenVerifier, VerifiedToken } from "../auth/verifier";
import { createPool, query, type Db } from "../db";
import type { Role } from "../domain/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.resolve(here, "../../../supabase/migrations");

/** In tests the bearer token is simply the user's id. */
export class TestVerifier implements TokenVerifier {
  async verify(token: string): Promise<VerifiedToken> {
    if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error("not a valid test token");
    return { sub: token };
  }
}

export interface Harness {
  db: Db;
  baseUrl: string;
  /** Creates a Supabase-style auth user and returns its id, which is also its token. */
  addUser(email: string, fullName: string): Promise<string>;
  setRole(id: string, role: Role, hostId?: number | null): Promise<void>;
  hostId(name: string): Promise<number>;
  roomId(name: string): Promise<number>;
  call(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; body: any }>;
  stop(): Promise<void>;
}

export async function startHarness(port = 54341): Promise<Harness> {
  // Postgres insists on creating its own data directory with its own permissions,
  // so only the folder above it is prepared here.
  const dataDir = process.env.PGTMP ?? `/tmp/archpoint-vms-api/${port}`;
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  fs.chmodSync(path.dirname(dataDir), 0o777);

  const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false });
  await server.initialise();
  await server.start();

  const url = `postgresql://postgres:pw@localhost:${port}/postgres`;
  const db = createPool(url);

  // The pieces of Supabase the schema leans on.
  await query(db, `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      raw_user_meta_data jsonb default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as
      $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);

  for (const file of fs.readdirSync(migrations).sort()) {
    await query(db, fs.readFileSync(path.join(migrations, file), "utf8"));
  }

  const app = createApp(db, new TestVerifier(), ["http://localhost:5173"]);
  const http: Server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  return {
    db,
    baseUrl,
    async addUser(email, fullName) {
      const rows = await query<{ id: string }>(
        db,
        "insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id",
        [email, fullName]
      );
      return rows[0]!.id;
    },
    async setRole(id, role, hostId = null) {
      await query(db, "update public.staff set role = $2, host_id = $3, active = true where id = $1", [id, role, hostId]);
    },
    async hostId(name) {
      const rows = await query<{ id: number }>(db, "select id from public.hosts where name = $1", [name]);
      return rows[0]!.id;
    },
    async roomId(name) {
      const rows = await query<{ id: number }>(db, "select id from public.rooms where name = $1", [name]);
      return rows[0]!.id;
    },
    async call(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const type = res.headers.get("content-type") ?? "";
      return { status: res.status, body: type.includes("json") ? await res.json() : await res.text() };
    },
    async stop() {
      http.close();
      await db.end();
      await server.stop();
    }
  };
}
