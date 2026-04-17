"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/import", {
          body: JSON.stringify({ url }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });

        const payload = (await response.json()) as { error?: string; id?: string };

        if (!response.ok || !payload.id) {
          throw new Error(payload.error ?? "Unable to queue the listing.");
        }

        router.push(`/listings/${payload.id}`);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to queue the listing.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <form className="panel stack gap-sm" onSubmit={onSubmit}>
      <div>
        <h2>Submit a listing</h2>
        <p className="muted">
          Paste an eBay or Kleinanzeigen listing URL. The worker queues import, crawl, and AI
          analysis automatically.
        </p>
      </div>

      <label className="stack gap-xs">
        <span>Listing URL</span>
        <input
          className="input"
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.kleinanzeigen.de/..."
          required
          type="url"
          value={url}
        />
      </label>

      <button className="button button--primary" disabled={pending} type="submit">
        {pending ? "Queueing..." : "Queue import"}
      </button>

      {feedback ? <p className="muted">{feedback}</p> : null}
    </form>
  );
}
