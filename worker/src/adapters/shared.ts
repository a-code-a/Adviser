import { load } from "cheerio";

import type {
  ListingCondition,
  ListingImage,
  ParserSignals,
  SellerSignals
} from "@/lib/core/marketplaces";

export class SourceBlockedError extends Error {
  constructor(
    message: string,
    readonly signature?: string
  ) {
    super(message);
    this.name = "SourceBlockedError";
  }
}

export function parseJsonLd<T>(html: string): T[] {
  const $ = load(html);
  const results: T[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const contents = $(element).contents().text().trim();
    if (!contents) {
      return;
    }

    try {
      const parsed = JSON.parse(contents) as T | T[];
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch {
      // Ignore malformed blocks.
    }
  });

  return results;
}

export function mapCondition(input: string | null | undefined): ListingCondition {
  const value = (input ?? "").toLowerCase();

  if (value.includes("new") || value.includes("neu")) {
    return "new";
  }

  if (value.includes("refurb")) {
    return "refurbished";
  }

  if (value.includes("used") || value.includes("gebraucht")) {
    return "used";
  }

  return "unknown";
}

export function parsePrice(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return 0;
  }

  const cleaned = value.replace(/[^\d,.-]/g, "");
  let normalized = cleaned;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replaceAll(".", "").replace(",", ".")
        : cleaned.replaceAll(",", "");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function imageListFromUnknown(value: unknown): ListingImage[] {
  if (!value) {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];

  return items
    .map((item, index) => {
      if (typeof item !== "string") {
        return null;
      }

      return {
        position: index,
        url: item
      } satisfies ListingImage;
    })
    .filter((item): item is ListingImage => item !== null);
}

export function normalizeSeller(input: Partial<SellerSignals> & { name?: string | null }): SellerSignals {
  return {
    badges: input.badges ?? [],
    externalSellerId: input.externalSellerId ?? null,
    isCommercial: input.isCommercial ?? null,
    locationText: input.locationText ?? null,
    memberSinceText: input.memberSinceText ?? null,
    name: input.name?.trim() || "Unknown seller",
    profileUrl: input.profileUrl ?? null,
    ratingCount: input.ratingCount ?? null,
    ratingScore: input.ratingScore ?? null
  };
}

export function buildParserSignals(input: Partial<ParserSignals>): ParserSignals {
  return {
    blockIndicators: input.blockIndicators ?? [],
    confidence: input.confidence ?? 0.7,
    extractionStrategy: input.extractionStrategy ?? "dom",
    missingFields: input.missingFields ?? [],
    warnings: input.warnings ?? []
  };
}

export async function fetchHtml(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return {
    html: await response.text(),
    response
  };
}

export function detectBlockedHtml(html: string) {
  const normalized = html.toLowerCase();

  for (const marker of [
    "captcha",
    "security challenge",
    "sicherheitsüberprüfung",
    "automated access",
    "verify you are human"
  ]) {
    if (normalized.includes(marker)) {
      throw new SourceBlockedError(`Source blocked by marker: ${marker}`, marker);
    }
  }
}
