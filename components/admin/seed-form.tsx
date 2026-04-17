"use client";

import { startTransition, useState } from "react";

export function AdminSeedForm() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [marketplace, setMarketplace] = useState<"ebay" | "kleinanzeigen">("ebay");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/seeds", {
          body: JSON.stringify({
            category: category || null,
            marketplace,
            query
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to enqueue crawl seed.");
        }

        setFeedback("Seed queued.");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to enqueue crawl seed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <form className="panel stack gap-sm" onSubmit={onSubmit}>
      <h2>Queue a seed crawl</h2>
      <p className="muted">
        Admin-only seed jobs discover listing URLs in bulk and feed them into the refresh queue.
      </p>

      <label className="stack gap-xs">
        <span>Marketplace</span>
        <select
          className="input"
          onChange={(event) => setMarketplace(event.target.value as "ebay" | "kleinanzeigen")}
          value={marketplace}
        >
          <option value="ebay">eBay</option>
          <option value="kleinanzeigen">Kleinanzeigen</option>
        </select>
      </label>

      <label className="stack gap-xs">
        <span>Query</span>
        <input
          className="input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="brompton faltrad"
          required
          value={query}
        />
      </label>

      <label className="stack gap-xs">
        <span>Category</span>
        <input
          className="input"
          onChange={(event) => setCategory(event.target.value)}
          placeholder="fahrrad"
          value={category}
        />
      </label>

      <button className="button button--primary" disabled={pending} type="submit">
        {pending ? "Queueing..." : "Queue seed"}
      </button>

      {feedback ? <p className="muted">{feedback}</p> : null}
    </form>
  );
}
