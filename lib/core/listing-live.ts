export const LISTING_LIVE_EVENT = "marketplace-advisor:listings/live-watch";

export type ListingLiveReason = "analysis" | "import" | "refresh";

export interface ListingLiveEventDetail {
  listingId: string;
  reason: ListingLiveReason;
}

export function dispatchListingLiveEvent(detail: ListingLiveEventDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ListingLiveEventDetail>(LISTING_LIVE_EVENT, {
      detail
    })
  );
}
