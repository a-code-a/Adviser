import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireServerEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  type CookieToSet = {
    name: string;
    options?: Parameters<typeof cookieStore.set>[2];
    value: string;
  };

  return createServerClient(
    requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
