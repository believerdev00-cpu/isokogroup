// Settings come from environment variables. In the Supabase Edge Function the
// platform provides SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and
// SUPABASE_DB_URL; the rest are set with `supabase secrets set`.
const env = process.env;
const isProduction = env.NODE_ENV === "production" || Boolean(env.SB_REGION ?? env.DENO_REGION);

function required(name: string, devDefault: string): string {
  const value = env[name] ?? (isProduction ? undefined : devDefault);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// Keys of the local Supabase started by `supabase start` (public, same on every machine).
const LOCAL_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const config = {
  isProduction,
  port: Number(env.PORT ?? 4100),
  // TRAINING_DB_URL overrides the platform's database address (e.g. a pooler URL)
  databaseUrl: env.TRAINING_DB_URL || required("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
  supabaseUrl: required("SUPABASE_URL", "http://127.0.0.1:54321").replace(/\/$/, ""),
  anonKey: required("SUPABASE_ANON_KEY", LOCAL_ANON),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", LOCAL_SERVICE),
  // Private Supabase Storage bucket for application documents and student photos
  storageBucket: env.TRAINING_STORAGE_BUCKET ?? "training",
  // Sites allowed to call the API from a browser (comma separated)
  allowedOrigins: (env.SITE_ORIGINS ?? "http://localhost:8080,http://localhost:8090")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  // Public address of the Isoko site, used in emails and on certificates
  publicUrl: (env.PUBLIC_SITE_URL ?? "http://localhost:8080").replace(/\/$/, ""),
  // Where the Training Center lives inside the Isoko site
  basePath: "/training-center",
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 8),
  smtp: env.SMTP_HOST
    ? {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 465),
        secure: (env.SMTP_SECURE ?? "true") === "true",
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
        from: env.MAIL_FROM ?? "Isoko Training Center <no-reply@isoko.rw>",
      }
    : null,
};
