import { load } from "cheerio";

import { DEFAULT_WEB_SEARCH_MAX_RESULTS } from "@/lib/core/config";
import { extractExternalId, type MarketplaceAdapter, type NormalizedComparable, type ScrapeListingResult } from "@/lib/core/marketplaces";
import { readEnvironment } from "@/lib/env";

import {
  buildParserSignals,
  detectBlockedHtml,
  fetchHtml,
  imageListFromUnknown,
  mapCondition,
  normalizeSeller,
  parseJsonLd,
  parsePrice
} from "./shared";

function buildBrowseHeaders(token: string) {
  const env = readEnvironment();

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-EBAY-C-MARKETPLACE-ID": env.EBAY_BROWSE_MARKETPLACE_ID
  };
}

function mapApiComparables(items: Array<Record<string, any>>): NormalizedComparable[] {
  return items.map((item, index) => ({
    condition: mapCondition(item.condition),
    currency: item.price?.currency ?? "EUR",
    marketplace: "ebay",
    priceAmount: parsePrice(item.price?.value),
    similarityScore: Number((0.95 - index * 0.06).toFixed(2)),
    source: "live",
    title: item.title ?? "Comparable listing",
    url: item.itemWebUrl ?? item.itemHref ?? "#"
  }));
}

export function parseEbayHtml(html: string, sourceUrl: string): ScrapeListingResult {
  detectBlockedHtml(html);
  const jsonLd = parseJsonLd<Record<string, any>>(html);
  const $ = load(html);
  const product =
    jsonLd.find((item) => item["@type"] === "Product") ??
    jsonLd.find((item) => item.name && item.offers);
  const offer = Array.isArray(product?.offers) ? product?.offers[0] : product?.offers ?? {};
  const seller = offer?.seller ?? {};
  const title = product?.name ?? $("meta[property='og:title']").attr("content") ?? $("title").text().trim();
  const description =
    product?.description ??
    $("meta[name='description']").attr("content") ??
    $("#viTabs_0_is").text().trim() ??
    "";
  const images = imageListFromUnknown(product?.image ?? $("meta[property='og:image']").attr("content"));
  const priceAmount = parsePrice(offer?.price ?? $("meta[property='product:price:amount']").attr("content"));
  const currency = offer?.priceCurrency ?? $("meta[property='product:price:currency']").attr("content") ?? "EUR";
  const externalId = extractExternalId(sourceUrl, "ebay") ?? product?.sku ?? "unknown";
  const locationText =
    $("[data-testid='ux-labels-values--itemLocation'] .ux-textspans").last().text().trim() || null;

  return {
    comparables: [],
    images,
    listing: {
      attributes: {},
      availability: offer?.availability ?? "unknown",
      canonicalUrl: sourceUrl,
      categoryPath: $("nav[aria-label='Breadcrumb'] li")
        .map((_, node) => $(node).text().trim())
        .get()
        .filter(Boolean),
      condition: mapCondition(offer?.itemCondition ?? $("meta[property='product:condition']").attr("content")),
      currency,
      description,
      externalId,
      locationText,
      marketplace: "ebay",
      priceAmount,
      priceText: `${priceAmount} ${currency}`,
      publishedAt: null,
      shippingAmount: null,
      title
    },
    parserSignals: buildParserSignals({
      confidence: product ? 0.93 : 0.58,
      extractionStrategy: product ? "jsonld" : "dom",
      missingFields: [!description && "description", !images.length && "images", !locationText && "location"].filter(
        Boolean
      ) as string[]
    }),
    seller: normalizeSeller({
      name:
        seller?.name ??
        $("[data-testid='ux-seller-section__item']").first().text().trim() ??
        "Unknown eBay seller",
      profileUrl: seller?.url ?? null
    }),
    snapshot: {
      parserVersion: "ebay-html-v1",
      rawHtml: html,
      scrapedAt: new Date().toISOString(),
      sourceUrl
    }
  };
}

function mapApiListing(payload: Record<string, any>, sourceUrl: string): ScrapeListingResult {
  return {
    comparables: [],
    images: imageListFromUnknown(payload.image?.imageUrl ? [payload.image.imageUrl] : payload.additionalImages?.map((image: any) => image.imageUrl)),
    listing: {
      attributes:
        Object.fromEntries(
          (payload.localizedAspects ?? []).map((aspect: Record<string, any>) => [
            aspect.name ?? "attribute",
            Array.isArray(aspect.value) ? aspect.value.join(", ") : aspect.value ?? ""
          ])
        ) ?? {},
      availability: payload.availability ?? payload.estimatedAvailabilityStatus ?? "unknown",
      canonicalUrl: payload.itemWebUrl ?? sourceUrl,
      categoryPath: (payload.categories ?? []).map((item: Record<string, any>) => item.categoryName).filter(Boolean),
      condition: mapCondition(payload.condition),
      currency: payload.price?.currency ?? "EUR",
      description: payload.shortDescription ?? payload.description ?? "",
      endsAt: payload.itemEndDate ?? null,
      externalId: payload.legacyItemId ?? extractExternalId(sourceUrl, "ebay") ?? "unknown",
      locationText:
        [payload.itemLocation?.city, payload.itemLocation?.stateOrProvince, payload.itemLocation?.country].filter(Boolean).join(", ") ||
        null,
      marketplace: "ebay",
      priceAmount: parsePrice(payload.price?.value),
      priceText: payload.price?.formattedValue ?? `${payload.price?.value ?? "0"} ${payload.price?.currency ?? "EUR"}`,
      publishedAt: payload.itemOriginDate ?? null,
      shippingAmount: parsePrice(payload.shippingOptions?.[0]?.shippingCost?.value ?? null),
      title: payload.title ?? "eBay item"
    },
    parserSignals: buildParserSignals({
      confidence: 0.98,
      extractionStrategy: "browse_api"
    }),
    seller: normalizeSeller({
      externalSellerId: payload.seller?.username ?? null,
      locationText: payload.seller?.feedbackPercentage ?? null,
      name: payload.seller?.username ?? "Unknown eBay seller",
      profileUrl: payload.seller?.sellerLegalInfo?.termsAndConditionsUrl ?? null,
      ratingCount: payload.seller?.feedbackScore ?? null,
      ratingScore: payload.seller?.feedbackPercentage ? Number(payload.seller.feedbackPercentage) : null
    }),
    snapshot: {
      parserVersion: "ebay-api-v1",
      rawPayload: payload,
      scrapedAt: new Date().toISOString(),
      sourceUrl
    }
  };
}

export class EbayAdapter implements MarketplaceAdapter {
  async fetchListing({ url }: { url: string }) {
    const env = readEnvironment();
    const externalId = extractExternalId(url, "ebay");

    if (env.EBAY_BROWSE_API_TOKEN && externalId) {
      const endpoint = new URL("https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id");
      endpoint.searchParams.set("legacy_item_id", externalId);

      try {
        const response = await fetch(endpoint, {
          headers: buildBrowseHeaders(env.EBAY_BROWSE_API_TOKEN)
        });

        if (response.ok) {
          const payload = (await response.json()) as Record<string, any>;
          return mapApiListing(payload, url);
        }
      } catch {
        // Fall back to HTML parsing.
      }
    }

    const { html } = await fetchHtml(url);
    return parseEbayHtml(html, url);
  }

  async search({ query }: { category?: string | null; query: string }) {
    const env = readEnvironment();

    if (env.EBAY_BROWSE_API_TOKEN) {
      const endpoint = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("limit", String(DEFAULT_WEB_SEARCH_MAX_RESULTS));

      const response = await fetch(endpoint, {
        headers: buildBrowseHeaders(env.EBAY_BROWSE_API_TOKEN)
      });

      if (response.ok) {
        const payload = (await response.json()) as Record<string, any>;
        const items = (payload.itemSummaries ?? []) as Array<Record<string, any>>;

        return {
          discoveredUrls: items.map((item) => item.itemWebUrl).filter(Boolean),
          metadata: {
            items: mapApiComparables(items)
          },
          snapshot: {
            parserVersion: "ebay-search-api-v1",
            rawPayload: payload,
            scrapedAt: new Date().toISOString(),
            sourceUrl: endpoint.toString()
          }
        };
      }
    }

    const endpoint = new URL("https://www.ebay.de/sch/i.html");
    endpoint.searchParams.set("_nkw", query);

    const { html } = await fetchHtml(endpoint.toString());
    const $ = load(html);
    const titles = $(".s-item__title")
      .map((_, node) => $(node).text().trim())
      .get();
    const urls = $(".s-item__link")
      .map((_, node) => $(node).attr("href"))
      .get()
      .filter(Boolean)
      .slice(0, DEFAULT_WEB_SEARCH_MAX_RESULTS) as string[];

    return {
      discoveredUrls: urls,
      metadata: {
        items: urls.map((itemUrl, index) => ({
          condition: "unknown",
          currency: "EUR",
          marketplace: "ebay",
          priceAmount: 0,
          similarityScore: Number((0.85 - index * 0.05).toFixed(2)),
          source: "live",
          title: titles[index] || `eBay result ${index + 1}`,
          url: itemUrl
        }))
      },
      snapshot: {
        parserVersion: "ebay-search-html-v1",
        rawHtml: html,
        scrapedAt: new Date().toISOString(),
        sourceUrl: endpoint.toString()
      }
    };
  }
}
