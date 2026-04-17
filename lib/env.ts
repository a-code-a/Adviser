import { z } from "zod";

const environmentSchema = z.object({
  ADMIN_EMAILS: z.string().optional(),
  EBAY_BROWSE_API_TOKEN: z.string().optional(),
  EBAY_BROWSE_MARKETPLACE_ID: z.string().default("EBAY_DE"),
  KLEINANZEIGEN_PROXY_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_ENABLE_WEB_SEARCH: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
  OPENROUTER_MODEL_ANALYSIS: z.string().default("google/gemini-3-flash-preview"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  WORKER_AUTH_TOKEN: z.string().optional()
});

export function readEnvironment() {
  return environmentSchema.parse(process.env);
}

export function getSupabasePublishableKey(env = readEnvironment()) {
  return env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
}

export function hasSupabaseBrowserConfig() {
  const env = readEnvironment();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && getSupabasePublishableKey(env));
}

export function requireServerEnv<K extends keyof ReturnType<typeof readEnvironment>>(key: K) {
  const env = readEnvironment();
  const value = env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

export function getAdminEmails() {
  const env = readEnvironment();
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}
