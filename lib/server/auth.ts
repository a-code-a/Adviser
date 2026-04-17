import "server-only";

import { redirect } from "next/navigation";

import { getAdminEmails, hasSupabaseBrowserConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ViewerProfile {
  email: string | null;
  id: string;
  role: string | null;
}

export async function getOptionalViewer() {
  if (!hasSupabaseBrowserConfig()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    email: user.email ?? null,
    id: user.id,
    role: (profile?.role as string | null | undefined) ?? null
  } satisfies ViewerProfile;
}

export async function requireViewer() {
  const viewer = await getOptionalViewer();

  if (!viewer) {
    redirect("/login");
  }

  return viewer;
}

export function isViewerAdmin(viewer: ViewerProfile | null) {
  if (!viewer) {
    return false;
  }

  if (viewer.role === "admin") {
    return true;
  }

  if (!viewer.email) {
    return false;
  }

  return getAdminEmails().has(viewer.email.toLowerCase());
}
