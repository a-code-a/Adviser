import { chromium } from "playwright";
import { load } from "cheerio";

import {
  DEFAULT_WEB_SEARCH_MAX_RESULTS
} from "@/lib/core/config";
import {
  extractExternalId,
  type MarketplaceAdapter,
  type NormalizedComparable,
  type ScrapeListingResult
} from "@/lib/core/marketplaces";
import { readEnvironment } from "@/lib/env";

import {
  SourceBlockedError,
  buildParserSignals,
  detectBlockedHtml,
  imageListFromUnknown,
  mapCondition,
  normalizeSeller,
  parsePrice
} from "./shared";

function extractNextData(html: string) {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as Record<string, any>;
  } catch {
    return null;
  }
}

function findLikelyListingNode(input: unknown): Record<string, any> | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const result = findLikelyListingNode(item);
      if (result) {
        return result;
      }
    }

    return null;
  }

  const record = input as Record<string, any>;

  if ((record.title || record.headline) && (record.adId || record.id || record.viewAdUrl || record.price)) {
    return record;
  }

  for (const value of Object.values(record)) {
    const result = findLikelyListingNode(value);
    if (result) {
      return result;
    }
  }

  return null;
}

function extractLikelySearchItems(input: unknown, limit = DEFAULT_WEB_SEARCH_MAX_RESULTS): NormalizedComparable[] {
  const results: NormalizedComparable[] = [];

  function visit(value: unknown) {
    if (results.length >= limit) {
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, any>;

    if ((record.title || record.headline) && (record.url || record.viewAdUrl || record.link)) {
      results.push({
        condition: mapCondition(record.condition ?? record.description),
        currency: "EUR",
        marketplace: "kleinanzeigen",
        priceAmount: parsePrice(record.price?.amount ?? record.price?.value ?? record.price),
        similarityScore: Number((0.86 - results.length * 0.05).toFixed(2)),
        source: "live",
        title: record.title ?? record.headline,
        url: record.url ?? record.viewAdUrl ?? record.link
      });
    }

    Object.values(record).forEach(visit);
  }

  visit(input);
  return results.slice(0, limit);
}

async function fetchWithBrowser(url: string) {
  const env = readEnvironment();
  const browser = await chromium.launch({
    headless: true,
    proxy: env.KLEINANZEIGEN_PROXY_URL ? { server: env.KLEINANZEIGEN_PROXY_URL } : undefined
  });

  try {
    const page = await browser.newPage({
      locale: "de-DE",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    });

    await page.goto(url, {
      timeout: 45000,
      waitUntil: "domcontentloaded"
    });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

    const html = await page.content();
    detectBlockedHtml(html);

    return html;
  } finally {
    await browser.close();
  }
}

export function parseKleinanzeigenHtml(html: string, sourceUrl: string): ScrapeListingResult {
  detectBlockedHtml(html);
  const nextData = extractNextData(html);
  const listingNode = findLikelyListingNode(nextData);
  const $ = load(html);
  const title =
    listingNode?.title ??
    listingNode?.headline ??
    $("meta[property='og:title']").attr("content") ??
    $("h1").first().text().trim() ??
    "Kleinanzeigen listing";
  const description =
    listingNode?.description ??
    $("meta[name='description']").attr("content") ??
    $("[data-testid='vip-description-text']").text().trim() ??
    "";
  const priceAmount = parsePrice(
    listingNode?.price?.amount ?? listingNode?.price?.value ?? listingNode?.price ?? $(".boxedarticle--price").text()
  );
  const locationText =
    listingNode?.location?.name ??
    listingNode?.adLocation?.displayName ??
    $("[data-testid='vip-ad-location']").text().trim() ??
    null;
  const images = imageListFromUnknown(
    listingNode?.images?.map?.((image: any) => image?.url ?? image?.src) ??
      $("meta[property='og:image']").attr("content")
  );

  return {
    comparables: [],
    images,
    listing: {
      attributes:
        Object.fromEntries(
          Object.entries(listingNode?.attributes ?? {}).map(([key, value]) => [key, String(value)])
        ) ?? {},
      availability: listingNode?.status ?? "active",
      canonicalUrl: sourceUrl,
      categoryPath:
        listingNode?.breadcrumbs?.map?.((item: any) => item?.name).filter(Boolean) ??
        $("ol li")
          .map((_, node) => $(node).text().trim())
          .get()
          .filter(Boolean),
      condition: mapCondition(listingNode?.condition ?? listingNode?.description),
      currency: "EUR",
      description,
      externalId:
        listingNode?.adId?.toString?.() ??
        listingNode?.id?.toString?.() ??
        extractExternalId(sourceUrl, "kleinanzeigen") ??
        "unknown",
      locationText,
      marketplace: "kleinanzeigen",
      priceAmount,
      priceText: `${priceAmount} EUR`,
      publishedAt: listingNode?.postedAt ?? null,
      shippingAmount: parsePrice(listingNode?.shipping?.amount ?? null),
      title
    },
    parserSignals: buildParserSignals({
      confidence: listingNode ? 0.88 : 0.54,
      extractionStrategy: listingNode ? "next_data" : "dom",
      missingFields: [!description && "description", !images.length && "images", !locationText && "location"].filter(
        Boolean
      ) as string[]
    }),
    seller: normalizeSeller({
      badges:
        listingNode?.seller?.badges?.map?.((badge: any) => badge?.label).filter(Boolean) ??
        $("[data-testid='vip-seller-badges'] *")
          .map((_, node) => $(node).text().trim())
          .get()
          .filter(Boolean),
      externalSellerId: listingNode?.seller?.id?.toString?.() ?? null,
      isCommercial: listingNode?.seller?.isCommercial ?? null,
      locationText,
      memberSinceText: listingNode?.seller?.memberSince ?? null,
      name:
        listingNode?.seller?.name ??
        $("[data-testid='vip-seller-profile'] h2").text().trim() ??
        "Unknown Kleinanzeigen seller",
      profileUrl: listingNode?.seller?.url ?? null,
      ratingCount: listingNode?.seller?.ratingCount ?? null,
      ratingScore: listingNode?.seller?.rating ?? null
    }),
    snapshot: {
      parserVersion: "kleinanzeigen-browser-v1",
      rawHtml: html,
      scrapedAt: new Date().toISOString(),
      sourceUrl
    }
  };
}

export class KleinanzeigenAdapter implements MarketplaceAdapter {
  async fetchListing({ url }: { url: string }) {
    const html = await fetchWithBrowser(url);
    return parseKleinanzeigenHtml(html, url);
  }

  async search({ query }: { category?: string | null; query: string }) {
    const searchUrl = `https://www.kleinanzeigen.de/s-${encodeURIComponent(query.trim().replace(/\s+/g, "-"))}/k0`;
    const html = await fetchWithBrowser(searchUrl).catch((error) => {
      if (error instanceof SourceBlockedError) {
        throw error;
      }

      return `<html><body></body></html>`;
    });

    const nextData = extractNextData(html);
    const comparables = extractLikelySearchItems(nextData);
    const $ = load(html);
    const comparableUrls = comparables.map((item) => item.url).filter(Boolean);
    const discoveredUrls =
      comparableUrls.length > 0
        ? comparableUrls
        : $("a[href*='/s-anzeige/']")
            .map((_, node) => $(node).attr("href"))
            .get()
            .filter(Boolean)
            .map((path) => new URL(path, "https://www.kleinanzeigen.de").toString())
            .slice(0, DEFAULT_WEB_SEARCH_MAX_RESULTS);

    return {
      discoveredUrls,
      metadata: {
        items: comparables
      },
      snapshot: {
        parserVersion: "kleinanzeigen-search-browser-v1",
        rawHtml: html,
        scrapedAt: new Date().toISOString(),
        sourceUrl: searchUrl
      }
    };
  }
}
