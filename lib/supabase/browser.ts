"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublishableKey, readEnvironment } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  const env = readEnvironment();
  const publishableKey = getSupabasePublishableKey(env);

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !publishableKey) {
    throw new Error("Supabase browser environment variables are missing.");
  }

  client ??= createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, publishableKey);

  return client;
}
