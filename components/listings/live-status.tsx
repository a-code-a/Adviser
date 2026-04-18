"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LISTING_LIVE_EVENT, type ListingLiveEventDetail, type ListingLiveReason } from "@/lib/core/listing-live";

interface ListingLiveSnapshot {
  generationMode: string | null;
  hasListing: boolean;
  hasReport: boolean;
  lastCrawledAt: string | null;
  lastError: string | null;
  reportId: string | null;
  targetStatus: string | null;
  trackingState: string | null;
}

interface ListingLiveStatusProps {
  initialSnapshot: ListingLiveSnapshot;
  listingId: string;
}

function isSettled(snapshot: ListingLiveSnapshot) {
  if (snapshot.targetStatus === "blocked" || snapshot.targetStatus === "failed") {
    return true;
  }

  return snapshot.hasListing && snapshot.hasReport;
}

function shouldPoll(snapshot: ListingLiveSnapshot) {
  if (snapshot.targetStatus === "blocked" || snapshot.targetStatus === "failed") {
    return false;
  }

  return !snapshot.hasListing || !snapshot.hasReport || snapshot.targetStatus === "queued";
}

function hasMeaningfulChange(previous: ListingLiveSnapshot, next: ListingLiveSnapshot) {
  return (
    previous.hasListing !== next.hasListing ||
    previous.hasReport !== next.hasReport ||
    previous.reportId !== next.reportId ||
    previous.targetStatus !== next.targetStatus ||
    previous.lastCrawledAt !== next.lastCrawledAt ||
    previous.lastError !== next.lastError ||
    previous.generationMode !== next.generationMode
  );
}

function mapPayloadToSnapshot(payload: Record<string, any>): ListingLiveSnapshot {
  return {
    generationMode: payload.report?.report_json?.generationMode ?? null,
    hasListing: Boolean(payload.listing),
    hasReport: Boolean(payload.report?.id),
    lastCrawledAt: payload.target?.last_crawled_at ?? null,
    lastError: payload.target?.last_error ?? null,
    reportId: payload.report?.id ?? null,
    targetStatus: payload.target?.status ?? null,
    trackingState: payload.trackedListing?.tracking_state ?? null
  };
}

function formatStatusTime(value: string | null) {
  if (!value) {
    return "Waiting for first update";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function derivePhase(snapshot: ListingLiveSnapshot, activeReason: ListingLiveReason | null) {
  if (snapshot.targetStatus === "blocked") {
    return {
      detail: snapshot.lastError ?? "The marketplace blocked the request.",
      intent: "danger" as const,
      title: "Marketplace blocked the crawl"
    };
  }

  if (snapshot.targetStatus === "failed" || snapshot.lastError) {
    return {
      detail: snapshot.lastError ?? "The latest crawl failed before fresh data was saved.",
      intent: "danger" as const,
      title: "Latest refresh needs attention"
    };
  }

  if (activeReason === "analysis") {
    return {
      detail: "The listing is already parsed. Gemini is building a fresh report from the latest normalized data.",
      intent: "warning" as const,
      title: "Running fresh Gemini analysis"
    };
  }

  if (activeReason === "refresh") {
    return {
      detail: "A fresh crawl was queued. This page is following the listing until the next snapshot lands.",
      intent: "warning" as const,
      title: "Refresh queued"
    };
  }

  if (!snapshot.hasListing) {
    return {
      detail: "The import is queued and the worker is still scraping the marketplace page.",
      intent: "warning" as const,
      title: "Scraping listing data"
    };
  }

  if (!snapshot.hasReport) {
    return {
      detail: "The listing has been normalized. Gemini is now building the report and selecting comparable listings.",
      intent: "warning" as const,
      title: "Generating analysis"
    };
  }

  if (snapshot.generationMode === "fallback") {
    return {
      detail: "The current saved report is a fallback result. You can queue another Gemini run once the listing data looks correct.",
      intent: "warning" as const,
      title: "Live data synced with fallback analysis"
    };
  }

  return {
    detail: `Latest synced update: ${formatStatusTime(snapshot.lastCrawledAt)}`,
    intent: "success" as const,
    title: "Live data synced"
  };
}

export function LiveListingStatus({ initialSnapshot, listingId }: ListingLiveStatusProps) {
  const router = useRouter();
  const [activeReason, setActiveReason] = useState<ListingLiveReason | null>(null);
  const [isPolling, setIsPolling] = useState(() => shouldPoll(initialSnapshot));
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [watchUntil, setWatchUntil] = useState<number | null>(() =>
    shouldPoll(initialSnapshot) ? Date.now() + 2 * 60 * 1000 : null
  );
  const snapshotRef = useRef(initialSnapshot);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    snapshotRef.current = initialSnapshot;

    if (shouldPoll(initialSnapshot)) {
      setWatchUntil(Date.now() + 2 * 60 * 1000);
    }

    if (isSettled(initialSnapshot)) {
      setActiveReason(null);
    }
  }, [
    initialSnapshot.generationMode,
    initialSnapshot.hasListing,
    initialSnapshot.hasReport,
    initialSnapshot.lastCrawledAt,
    initialSnapshot.lastError,
    initialSnapshot.reportId,
    initialSnapshot.targetStatus
  ]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const pollDetail = useEffectEvent(async () => {
    setIsPolling(true);

    try {
      const response = await fetch(`/api/listings/${listingId}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as Record<string, any>;
      const nextSnapshot = mapPayloadToSnapshot(payload);
      const previousSnapshot = snapshotRef.current;
      const changed = hasMeaningfulChange(previousSnapshot, nextSnapshot);

      if (changed) {
        setSnapshot(nextSnapshot);
      }

      if (changed) {
        router.refresh();
      }

      if (isSettled(nextSnapshot) && activeReason) {
        setActiveReason(null);
      }

      if (isSettled(nextSnapshot) && !activeReason) {
        setWatchUntil(null);
      }
    } finally {
      setIsPolling(false);
    }
  });

  useEffect(() => {
    const handleWatch = (event: Event) => {
      const customEvent = event as CustomEvent<ListingLiveEventDetail>;

      if (customEvent.detail?.listingId !== listingId) {
        return;
      }

      setActiveReason(customEvent.detail.reason);
      setWatchUntil(Date.now() + 2 * 60 * 1000);
    };

    window.addEventListener(LISTING_LIVE_EVENT, handleWatch);
    return () => window.removeEventListener(LISTING_LIVE_EVENT, handleWatch);
  }, [listingId]);

  useEffect(() => {
    const shouldKeepPolling =
      shouldPoll(snapshot) || (watchUntil !== null && watchUntil > Date.now());

    if (!shouldKeepPolling) {
      return;
    }

    void pollDetail();

    const timer = window.setInterval(() => {
      if (watchUntil !== null && watchUntil <= Date.now() && !shouldPoll(snapshotRef.current)) {
        window.clearInterval(timer);
        setWatchUntil(null);
        return;
      }

      void pollDetail();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [pollDetail, snapshot, watchUntil]);

  const phase = useMemo(() => derivePhase(snapshot, activeReason), [activeReason, snapshot]);
  const steps = [
    {
      label: "Queued",
      status: snapshot.hasListing || snapshot.targetStatus !== "queued" ? "done" : "active"
    },
    {
      label: "Scraped",
      status: snapshot.hasListing ? "done" : "pending"
    },
    {
      label: "Gemini report",
      status: snapshot.hasReport ? "done" : snapshot.hasListing ? "active" : "pending"
    }
  ];

  return (
    <section className="panel listing-live-panel stack gap-sm">
      <div className="row space-between wrap gap-sm">
        <div className="stack gap-xs">
          <div className="row gap-sm wrap">
            <span className={`live-dot live-dot--${phase.intent}`} aria-hidden="true" />
            <strong>{phase.title}</strong>
          </div>
          <p className="muted">{phase.detail}</p>
        </div>
        <div className="stack gap-xs live-meta">
          <span className="detail-key">Worker polling</span>
          <strong className="detail-value">{isPolling || shouldPoll(snapshot) || activeReason ? "Live" : "Idle"}</strong>
        </div>
      </div>

      <div className="live-step-grid">
        {steps.map((step) => (
          <div className={`live-step live-step--${step.status}`} key={step.label}>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
