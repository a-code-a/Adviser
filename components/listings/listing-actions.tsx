"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { dispatchListingLiveEvent } from "@/lib/core/listing-live";

interface ListingActionsProps {
  listingId: string;
  refreshState?: {
    cooldownHours: number;
    isCoolingDown: boolean;
    lastRequestedAt: string | null;
    nextAllowedAt: string | null;
  } | null;
  trackingState?: string | null;
}

function formatCooldownLabel(nextAllowedAt: string | null, now: number) {
  if (!nextAllowedAt) {
    return "Refresh cooling down";
  }

  const remainingMs = new Date(nextAllowedAt).getTime() - now;
  if (remainingMs <= 0) {
    return "Manual refresh";
  }

  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return `Refresh in ${remainingMinutes} min`;
}

export function ListingActions({ listingId, refreshState, trackingState }: ListingActionsProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pendingAction, setPendingAction] = useState<"refresh" | "track" | null>(null);
  const nextAllowedTimestamp = refreshState?.nextAllowedAt ? new Date(refreshState.nextAllowedAt).getTime() : null;
  const isCoolingDown = nextAllowedTimestamp != null && nextAllowedTimestamp > now;
  const refreshButtonLabel = useMemo(() => {
    if (pendingAction === "refresh") {
      return "Queueing refresh...";
    }

    if (isCoolingDown) {
      return formatCooldownLabel(refreshState?.nextAllowedAt ?? null, now);
    }

    return "Manual refresh";
  }, [isCoolingDown, now, pendingAction, refreshState?.nextAllowedAt]);

  useEffect(() => {
    if (!isCoolingDown) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => window.clearInterval(timer);
  }, [isCoolingDown]);

  const runAction = async (path: string, action: "refresh" | "track") => {
    setPendingAction(action);
    setFeedback(null);

    try {
      const response = await fetch(path, {
        method: "POST"
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Refresh already queued. Live updates are still running.");
        }

        throw new Error(payload.error ?? "Action failed.");
      }

      if (action === "refresh") {
        setFeedback("Refresh queued. This page will update automatically when new data arrives.");
        dispatchListingLiveEvent({
          listingId,
          reason: "refresh"
        });
      } else {
        setFeedback("Tracking enabled.");
      }

      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="stack gap-sm">
      <div className="row gap-sm wrap">
        <button
          className="button button--primary"
          disabled={pendingAction !== null || isCoolingDown}
          onClick={() => void runAction(`/api/listings/${listingId}/refresh`, "refresh")}
          type="button"
        >
          {refreshButtonLabel}
        </button>

        {trackingState === "active" ? null : (
          <button
            className="button button--ghost"
            disabled={pendingAction !== null}
            onClick={() => void runAction(`/api/listings/${listingId}/track`, "track")}
            type="button"
          >
            {pendingAction === "track" ? "Saving..." : "Enable tracking"}
          </button>
        )}
      </div>

      {isCoolingDown ? (
        <p className="muted">
          A refresh was already requested recently. The page now follows live status updates instead of retrying the refresh endpoint.
        </p>
      ) : null}
      {feedback ? <p className="muted">{feedback}</p> : null}
    </div>
  );
}
