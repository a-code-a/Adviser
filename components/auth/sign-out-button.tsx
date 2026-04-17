"use client";

import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();

  const onClick = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button className="button button--ghost" onClick={onClick} type="button">
      Sign out
    </button>
  );
}
