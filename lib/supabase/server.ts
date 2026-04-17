import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublishableKey, readEnvironment, requireServerEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = readEnvironment();
  const publishableKey = getSupabasePublishableKey(env);
  type CookieToSet = {
    name: string;
    options?: Parameters<typeof cookieStore.set>[2];
    value: string;
  };

  if (!publishableKey) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return createServerClient(
    requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, options, value }: CookieToSet) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // No-op in Server Components.
          }
        }
      }
    }
  );
}
