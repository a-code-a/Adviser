import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabasePublishableKey, readEnvironment } from "@/lib/env";

export async function proxy(request: NextRequest) {
  const env = readEnvironment();
  const publishableKey = getSupabasePublishableKey(env);
  type CookieToSet = {
    name: string;
    options?: Parameters<ReturnType<typeof NextResponse.next>["cookies"]["set"]>[2];
    value: string;
  };

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !publishableKey) {
    return NextResponse.next({
      request
    });
  }

  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }: CookieToSet) => request.cookies.set(name, value));

        response = NextResponse.next({
          request
        });

        cookiesToSet.forEach(({ name, options, value }: CookieToSet) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
