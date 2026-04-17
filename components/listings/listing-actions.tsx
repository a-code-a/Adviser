"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

interface ListingActionsProps {
  listingId: string;
  trackingState?: string | null;
}

export function ListingActions({ listingId, trackingState }: ListingActionsProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"refresh" | "track" | null>(null);

  const runAction = (path: string, action: "refresh" | "track") => {
    setPendingAction(action);
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch(path, {
          method: "POST"
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Action failed.");
        }

        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Action failed.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  return (
    <div className="stack gap-sm">
      <div className="row gap-sm wrap">
        <button
          className="button button--primary"
          disabled={pendingAction !== null}
          onClick={() => runAction(`/api/listings/${listingId}/refresh`, "refresh")}
          type="button"
        >
          {pendingAction === "refresh" ? "Queueing refresh..." : "Manual refresh"}
        </button>

        {trackingState === "active" ? null : (
          <button
            className="button button--ghost"
            disabled={pendingAction !== null}
            onClick={() => runAction(`/api/listings/${listingId}/track`, "track")}
            type="button"
          >
            {pendingAction === "track" ? "Saving..." : "Enable tracking"}
          </button>
        )}
      </div>

      {feedback ? <p className="muted">{feedback}</p> : null}
    </div>
  );
}
