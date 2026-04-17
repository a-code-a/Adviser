"use client";

import { startTransition, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFeedback(null);

    startTransition(async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const redirectTo = `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo
          }
        });

        if (error) {
          throw error;
        }

        setFeedback("Check your inbox for the magic link.");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to send magic link.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <form className="panel stack gap-sm" onSubmit={onSubmit}>
      <div>
        <h2>Magic link sign in</h2>
        <p className="muted">
          Use email-based access for imports, tracked listings, and analyst reports.
        </p>
      </div>

      <label className="stack gap-xs">
        <span>Email</span>
        <input
          autoComplete="email"
          className="input"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </label>

      <button className="button button--primary" disabled={pending} type="submit">
        {pending ? "Sending link..." : "Send magic link"}
      </button>

      {feedback ? <p className="muted">{feedback}</p> : null}
    </form>
  );
}
