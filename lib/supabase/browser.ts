"use client";

import { createBrowserClient } from "@supabase/ssr";

import { readEnvironment } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  const env = readEnvironment();

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase browser environment variables are missing.");
  }

  client ??= createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return client;
}
