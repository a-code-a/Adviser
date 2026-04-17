import { redirect } from "next/navigation";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer } from "@/lib/server/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const viewer = await getOptionalViewer();

  if (viewer) {
    redirect("/dashboard");
  }

  if (!hasSupabaseBrowserConfig()) {
    return (
      <section className="panel stack gap-sm">
        <h1>Supabase is not configured yet</h1>
        <p className="muted">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable magic-link
          sign in.
        </p>
      </section>
    );
  }

  return (
    <section className="grid-two login-grid">
      <div className="stack gap-md">
        <span className="eyebrow">Access</span>
        <h1>Authenticate once, then let the worker pipeline do the rest.</h1>
        <p className="lead">
          The public app uses Supabase email magic links. Every import, tracked listing, and report
          stays scoped to the signed-in user through row-level security.
        </p>
      </div>

      <LoginForm />
    </section>
  );
}
