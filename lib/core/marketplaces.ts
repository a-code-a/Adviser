import { z } from "zod";

export const MARKETPLACE_NAMES = ["ebay", "kleinanzeigen"] as const;

export type MarketplaceName = (typeof MARKETPLACE_NAMES)[number];

export type ListingCondition = "new" | "used" | "refurbished" | "unknown";

export interface ListingImage {
  altText?: string | null;
  position: number;
  url: string;
}

export interface SellerSignals {
  badges: string[];
  externalSellerId?: string | null;
  isCommercial?: boolean | null;
  locationText?: string | null;
  memberSinceText?: string | null;
  name: string;
  profileUrl?: string | null;
  ratingCount?: number | null;
  ratingScore?: number | null;
}

export interface NormalizedComparable {
  condition: ListingCondition;
  currency: string;
  marketplace: MarketplaceName;
  priceAmount: number;
  similarityScore: number;
  source: "internal" | "live";
  title: string;
  url: string;
}

export interface ParserSignals {
  blockIndicators: string[];
  confidence: number;
  extractionStrategy: string;
  missingFields: string[];
  warnings: string[];
}

export interface ListingSnapshot {
  parserVersion: string;
  rawHtml?: string;
  rawPayload?: unknown;
  scrapedAt: string;
  sourceUrl: string;
}

export interface NormalizedListing {
  attributes: Record<string, string>;
  availability: string;
  canonicalUrl: string;
  categoryPath: string[];
  condition: ListingCondition;
  currency: string;
  description: string;
  endsAt?: string | null;
  externalId: string;
  locationText?: string | null;
  marketplace: MarketplaceName;
  priceAmount: number;
  priceText: string;
  publishedAt?: string | null;
  shippingAmount?: number | null;
  title: string;
}

export interface ScrapeListingResult {
  comparables: NormalizedComparable[];
  images: ListingImage[];
  listing: NormalizedListing;
  parserSignals: ParserSignals;
  seller: SellerSignals;
  snapshot: ListingSnapshot;
}

export interface SearchSeedResult {
  discoveredUrls: string[];
  metadata?: Record<string, unknown>;
  snapshot?: ListingSnapshot;
}

export interface MarketplaceAdapter {
  fetchListing(input: {
    url: string;
  }): Promise<ScrapeListingResult>;
  search(input: {
    category?: string | null;
    query: string;
  }): Promise<SearchSeedResult>;
}

export const marketplaceSchema = z.enum(MARKETPLACE_NAMES);

const marketplaceHosts: Record<MarketplaceName, string[]> = {
  ebay: ["ebay.", "ebay.de"],
  kleinanzeigen: ["kleinanzeigen.de", "www.kleinanzeigen.de"]
};

export function detectMarketplaceFromUrl(input: string): MarketplaceName | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();

  for (const [marketplace, hosts] of Object.entries(marketplaceHosts) as Array<
    [MarketplaceName, string[]]
  >) {
    if (hosts.some((host) => hostname === host || hostname.endsWith(host) || hostname.includes(host))) {
      return marketplace;
    }
  }

  return null;
}

export function normalizeMarketplaceUrl(input: string): string {
  const url = new URL(input);

  url.hash = "";

  if (url.hostname.startsWith("m.")) {
    url.hostname = url.hostname.slice(2);
  }

  for (const trackingParam of [
    "_trkparms",
    "_trksid",
    "itmmeta",
    "campid",
    "customid",
    "mkcid",
    "mkevt"
  ]) {
    url.searchParams.delete(trackingParam);
  }

  return url.toString();
}

export function extractExternalId(urlString: string, marketplace: MarketplaceName): string | null {
  try {
    const url = new URL(urlString);
    const segments = url.pathname.split("/").filter(Boolean);

    if (marketplace === "ebay") {
      const directMatch = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{8,})/);
      if (directMatch) {
        return directMatch[1];
      }

      const queryId = url.searchParams.get("item");
      if (queryId) {
        return queryId;
      }
    }

    if (marketplace === "kleinanzeigen") {
      const lastSegment = segments.at(-1);
      if (lastSegment) {
        const match = lastSegment.match(/-(\d+)-\d+-\d+$/);
        if (match) {
          return match[1];
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function ensureMarketplaceUrl(input: string): {
  marketplace: MarketplaceName;
  normalizedUrl: string;
} {
  const marketplace = detectMarketplaceFromUrl(input);

  if (!marketplace) {
    throw new Error("Only eBay and Kleinanzeigen URLs are supported.");
  }

  return {
    marketplace,
    normalizedUrl: normalizeMarketplaceUrl(input)
  };
}
