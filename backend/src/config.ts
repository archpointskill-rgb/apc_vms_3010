import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is missing. Copy .env.example to .env and fill it in.`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  supabase: {
    url: required("SUPABASE_URL"),
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  },
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean),
  make: {
    webhookUrl: process.env.MAKE_WEBHOOK_URL ?? "",
    secret: process.env.MAKE_WEBHOOK_SECRET ?? ""
  },
  office: {
    timezone: "Asia/Kolkata",
    defaultCountryCode: "91",
    /** A visit still open after this many hours is flagged for review, never closed. */
    reviewAfterHours: 3
  }
} as const;
