"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { dispatchListingLiveEvent } from "@/lib/core/listing-live";

interface AnalysisActionsProps {
  listingId: string;
}

export function AnalysisActions({ listingId }: AnalysisActionsProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const runAnalysis = async () => {
    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/listings/${listingId}/analyze`, {
        method: "POST"
      });
      const payload = (await response.json()) as {
        error?: string;
        generationMode?: "fallback" | "model";
        modelSlug?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Analysis failed.");
      }

      setFeedback(
        payload.generationMode === "model"
          ? `Fresh Gemini analysis saved via ${payload.modelSlug}.`
          : "Fallback analysis saved because the model run did not complete cleanly."
      );
      dispatchListingLiveEvent({
        listingId,
        reason: "analysis"
      });
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="stack gap-sm">
      <button
        className="button button--primary"
        disabled={pending}
        onClick={() => void runAnalysis()}
        type="button"
      >
        {pending ? "Running Gemini analysis..." : "Generate fresh Gemini analysis"}
      </button>

      {feedback ? <p className="muted">{feedback}</p> : null}
    </div>
  );
}
