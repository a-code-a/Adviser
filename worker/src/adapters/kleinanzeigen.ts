import { chromium } from "playwright";
import { load } from "cheerio";

import { DEFAULT_WEB_SEARCH_MAX_RESULTS } from "@/lib/core/config";
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

function cleanInlineText(value: string | null | undefined) {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value: string | null | undefined) {
  const lines = (value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim());

  const compacted: string[] = [];
  let previousBlank = true;

  for (const line of lines) {
    if (!line) {
      if (!previousBlank && compacted.length > 0) {
        compacted.push("");
      }

      previousBlank = true;
      continue;
    }

    compacted.push(line);
    previousBlank = false;
  }

  return compacted.join("\n").trim();
}

function pickFirstString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = cleanInlineText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function pickLongestString(...values: Array<string | null | undefined>) {
  return values
    .map((value) => normalizeMultilineText(value))
    .sort((left, right) => right.length - left.length)
    .find(Boolean) ?? null;
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => cleanInlineText(value)).filter(Boolean))];
}

function firstRegexCapture(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = match?.[1];

    if (value) {
      return cleanInlineText(value);
    }
  }

  return null;
}

function textFromSelectors($: ReturnType<typeof load>, selectors: string[]) {
  for (const selector of selectors) {
    const value = cleanInlineText($(selector).first().text());
    if (value) {
      return value;
    }
  }

  return null;
}

function textWithBreaksFromSelectors($: ReturnType<typeof load>, selectors: string[]) {
  for (const selector of selectors) {
    const node = $(selector).first();

    if (!node.length) {
      continue;
    }

    const clone = node.clone();
    clone.find("br").replaceWith("\n");
    clone.find("p").each((_, element) => {
      $(element).append("\n\n");
    });
    clone.find("li").each((_, element) => {
      const item = $(element);
      item.prepend("- ");
      item.append("\n");
    });

    const value = normalizeMultilineText(clone.text());
    if (value) {
      return value;
    }
  }

  return null;
}

function parseScopedJsonLd($: ReturnType<typeof load>, containerSelector: string) {
  const root = $(containerSelector).length ? $(containerSelector) : $.root();
  const results: Array<Record<string, any>> = [];

  function visit(value: unknown) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    results.push(value as Record<string, any>);
  }

  root.find("script[type='application/ld+json']").each((_, element) => {
    const contents = $(element).contents().text().trim();
    if (!contents) {
      return;
    }

    try {
      visit(JSON.parse(contents));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });

  return results;
}

function asAbsoluteKleinanzeigenUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, "https://www.kleinanzeigen.de").toString();
  } catch {
    return null;
  }
}

function parsePublishedAt(value: string | null | undefined) {
  const normalized = cleanInlineText(value);

  if (!normalized) {
    return null;
  }

  const absoluteMatch = normalized.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (absoluteMatch) {
    const day = Number.parseInt(absoluteMatch[1], 10);
    const month = Number.parseInt(absoluteMatch[2], 10);
    const rawYear = Number.parseInt(absoluteMatch[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hours = absoluteMatch[4] ? Number.parseInt(absoluteMatch[4], 10) : 12;
    const minutes = absoluteMatch[5] ? Number.parseInt(absoluteMatch[5], 10) : 0;

    return new Date(Date.UTC(year, month - 1, day, hours, minutes)).toISOString();
  }

  const relativeMatch = normalized.match(/^(Heute|Gestern)(?:,\s*(\d{1,2}):(\d{2}))?/i);
  if (relativeMatch) {
    const base = new Date();
    if (/gestern/i.test(relativeMatch[1])) {
      base.setDate(base.getDate() - 1);
    }

    const hours = relativeMatch[2] ? Number.parseInt(relativeMatch[2], 10) : 12;
    const minutes = relativeMatch[3] ? Number.parseInt(relativeMatch[3], 10) : 0;

    return new Date(
      Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes)
    ).toISOString();
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function assignAttribute(attributes: Record<string, string>, key: string | null | undefined, value: string | null | undefined) {
  const normalizedKey = cleanInlineText(key);
  const normalizedValue = cleanInlineText(value);

  if (!normalizedKey || !normalizedValue || normalizedKey === normalizedValue || attributes[normalizedKey]) {
    return;
  }

  attributes[normalizedKey] = normalizedValue;
}

function extractAttributesFromDescription(description: string) {
  const attributes: Record<string, string> = {};
  const lines = normalizeMultilineText(description).split("\n");

  for (const line of lines) {
    if (!line.includes(":") || line.length > 160) {
      continue;
    }

    const [rawKey, ...rest] = line.split(":");
    const rawValue = rest.join(":");
    const key = cleanInlineText(rawKey);
    const value = cleanInlineText(rawValue);

    if (!key || !value || key.length > 40 || /^(Ausstattung|Hinweis|Sonstiges|Rechtliches)$/i.test(key)) {
      continue;
    }

    assignAttribute(attributes, key, value);
  }

  return attributes;
}

function extractDetailAttributes($: ReturnType<typeof load>, description: string) {
  const attributes: Record<string, string> = {};

  const detailRowSelectors = [
    "#viewad-details .addetailslist--detail",
    "#viewad-details li",
    ".addetailslist--detail"
  ];

  for (const selector of detailRowSelectors) {
    $(selector).each((_, element) => {
      const row = $(element);
      const label =
        pickFirstString(
          row.find(".addetailslist--detail--label").first().text(),
          row.find(".addetailslist--detail--title").first().text(),
          row.find("dt").first().text(),
          row.find("th").first().text()
        ) ??
        (() => {
          const lines = normalizeMultilineText(row.text()).split("\n").filter(Boolean);
          return lines[0] ?? null;
        })();
      const value =
        pickFirstString(
          row.find(".addetailslist--detail--value").first().text(),
          row.find("dd").first().text(),
          row.find("td").first().text()
        ) ??
        (() => {
          const lines = normalizeMultilineText(row.text()).split("\n").filter(Boolean);
          return lines.slice(1).join(", ") || null;
        })();

      assignAttribute(attributes, label, value);
    });
  }

  const featureTags = dedupeStrings(
    $("#viewad-configuration .checktag, #viewad-configuration li, .checktag")
      .map((_, element) => $(element).text())
      .get()
  );

  if (featureTags.length > 0) {
    assignAttribute(attributes, "Ausstattung", featureTags.join(", "));
  }

  if (Object.keys(attributes).length === 0) {
    return extractAttributesFromDescription(description);
  }

  return attributes;
}

function extractMainImages($: ReturnType<typeof load>, title: string | null) {
  const scopedJsonLd = parseScopedJsonLd($, "#viewad-product");
  const imageCandidates: Array<{ altText?: string | null; url: string }> = [];

  function pushImage(url: string | null | undefined, altText?: string | null) {
    const absoluteUrl = asAbsoluteKleinanzeigenUrl(url);

    if (!absoluteUrl || imageCandidates.some((candidate) => candidate.url === absoluteUrl)) {
      return;
    }

    imageCandidates.push({
      altText: cleanInlineText(altText) || title || null,
      url: absoluteUrl
    });
  }

  function visitImageValue(value: unknown, altText?: string | null) {
    if (typeof value === "string") {
      pushImage(value, altText);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => visitImageValue(entry, altText));
      return;
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, any>;
      pushImage(record.contentUrl ?? record.url ?? record.src, altText);
      visitImageValue(record.image, altText);
    }
  }

  scopedJsonLd.forEach((item) => {
    const itemTitle = pickFirstString(item.title, item.name, title);
    visitImageValue(item.contentUrl ?? item.url ?? item.image, itemTitle);
  });

  $("#viewad-product img").each((_, element) => {
    const node = $(element);
    const srcset = node.attr("srcset")?.split(",")[0]?.trim().split(" ")[0];
    pushImage(node.attr("data-imgsrc") ?? srcset ?? node.attr("src"), node.attr("alt") ?? title);
  });

  pushImage($("meta[property='og:image']").attr("content"), title);

  return imageCandidates.map((image, index) => ({
    altText: image.altText ?? title ?? null,
    position: index,
    url: image.url
  }));
}

function extractSellerSignals(
  $: ReturnType<typeof load>,
  html: string,
  listingNode: Record<string, any> | null,
  locationText: string | null
) {
  const sellerScope = $("#viewad-profile-box, #viewad-contact-modal-form, #viewad-contact");
  const sellerText = normalizeMultilineText(sellerScope.first().text());
  const sellerProfileUrl = asAbsoluteKleinanzeigenUrl(
    $("#viewad-profile-box a[href*='userId='], #viewad-profile-box a[href*='/s-bestandsliste.html']").first().attr("href") ??
      $("#viewad-contact-modal-form a[href*='userId=']").first().attr("href") ??
      listingNode?.seller?.url
  );
  const sellerTypeHint =
    pickFirstString(
      firstRegexCapture(html, [/ad_seller_type":"([^"]+)"/i, /dimension39":"([^"]+)"/i]),
      sellerText.match(/(Privat(?:anbieter)?|Gewerblich(?:er Anbieter)?)/i)?.[1]
    ) ?? null;
  const ratingScoreFromText = sellerText.match(/([0-5](?:[,.]\d+)?)\s*(?:\/|von)\s*5/i)?.[1]?.replace(",", ".");
  const ratingCountFromText = sellerText.match(/(\d+)\s*(?:Bewertungen|reviews?)/i)?.[1];

  return normalizeSeller({
    badges:
      dedupeStrings([
        ...(listingNode?.seller?.badges?.map?.((badge: any) => badge?.label).filter(Boolean) ?? []),
        ...sellerScope
          .find(".userbadge-tag, .simpletag, .badge, [class*='badge']")
          .map((_, element) => $(element).text())
          .get()
      ]),
    externalSellerId:
      pickFirstString(
        listingNode?.seller?.id?.toString?.(),
        sellerProfileUrl?.match(/userId=(\d+)/i)?.[1],
        firstRegexCapture(html, [/posterid":"(\d+)"/i])
      ) ?? null,
    isCommercial:
      sellerTypeHint != null
        ? !sellerTypeHint.toLowerCase().includes("priv")
        : (listingNode?.seller?.isCommercial ?? null),
    locationText:
      pickFirstString(
        listingNode?.seller?.location?.name,
        textFromSelectors($, [
          "#viewad-profile-box .text-body-small",
          "#viewad-contact .usercard--info--collumn--description"
        ]),
        locationText
      ) ?? null,
    memberSinceText:
      pickFirstString(
        listingNode?.seller?.memberSince,
        sellerText.match(/(Mitglied seit[^\n]*)/i)?.[1],
        sellerText.match(/(Aktiv seit[^\n]*)/i)?.[1]
      ) ?? null,
    name:
      pickFirstString(
        listingNode?.seller?.name,
        $("#viewad-profile-box h2").first().text(),
        $("#viewad-profile-box .userprofile-vip a").first().text(),
        $("#viewad-contact-modal-form .usercard h2").first().text()
      ) ?? "Unknown Kleinanzeigen seller",
    profileUrl: sellerProfileUrl,
    ratingCount:
      listingNode?.seller?.ratingCount ??
      (ratingCountFromText ? Number.parseInt(ratingCountFromText, 10) : null),
    ratingScore:
      listingNode?.seller?.rating ??
      (ratingScoreFromText ? Number.parseFloat(ratingScoreFromText) : null)
  });
}

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
  const scopedJsonLd = parseScopedJsonLd($, "#viewad-product");
  const jsonLdTitle = pickFirstString(...scopedJsonLd.map((item) => item.title ?? item.name));
  const jsonLdDescription = pickLongestString(...scopedJsonLd.map((item) => item.description));
  const domDescription = textWithBreaksFromSelectors($, ["#viewad-description-text", "[data-testid='vip-description-text']"]);
  const title =
    pickFirstString(
      textFromSelectors($, ["#viewad-title", "main h1", "h1"]),
      listingNode?.title,
      listingNode?.headline,
      jsonLdTitle,
      $("meta[property='og:title']").attr("content")
    ) ?? "Kleinanzeigen listing";
  const description =
    pickFirstString(
      domDescription,
      listingNode?.description,
      jsonLdDescription,
      $("meta[name='description']").attr("content")
    ) ?? "";
  const priceText =
    pickFirstString(
      textFromSelectors($, ["#viewad-price", ".boxedarticle--price"]),
      cleanInlineText($("meta[itemprop='price']").attr("content")),
      typeof listingNode?.price === "number"
        ? String(listingNode.price)
        : listingNode?.price?.amount?.toString?.() ??
            listingNode?.price?.value?.toString?.() ??
            listingNode?.price
    ) ?? "0 EUR";
  const priceAmount = parsePrice(priceText);
  const locationText =
    pickFirstString(
      textFromSelectors($, ["#viewad-locality", "[data-testid='vip-ad-location']", ".boxedarticle--details--address"]),
      listingNode?.location?.name,
      listingNode?.adLocation?.displayName,
      $("meta[property='og:locality']").attr("content")
    ) ?? null;
  const domAttributes = extractDetailAttributes($, description);
  const extractedImages = extractMainImages($, title);
  const images =
    extractedImages.length > 0
      ? extractedImages
      : imageListFromUnknown(
          listingNode?.images?.map?.((image: any) => image?.url ?? image?.src) ??
            $("meta[property='og:image']").attr("content")
        );
  const categoryPath = dedupeStrings([
    ...(listingNode?.breadcrumbs?.map?.((item: any) => item?.name).filter(Boolean) ?? []),
    ...$("#vap-brdcrmb [itemprop='name']")
      .map((_, element) => $(element).text())
      .get(),
    ...$(".breadcrump-link")
      .map((_, element) => $(element).text())
      .get()
  ]);
  const publishedAt = parsePublishedAt(
    pickFirstString(
      textFromSelectors($, ["#viewad-extra-info--creation-date", "#viewad-extra-info"]),
      firstRegexCapture(html, [/adCreationDate:\s*'([^']+)'/i, /"adCreationDate"\s*:\s*"([^"]+)"/i]),
      listingNode?.postedAt
    )
  );
  const seller = extractSellerSignals($, html, listingNode, locationText);
  const extractionStrategy = listingNode ? "next_data+dom" : "dom";

  return {
    comparables: [],
    images,
    listing: {
      attributes:
        Object.keys(domAttributes).length > 0
          ? domAttributes
          : Object.fromEntries(
              Object.entries(listingNode?.attributes ?? {}).map(([key, value]) => [key, String(value)])
            ),
      availability: listingNode?.status ?? "active",
      canonicalUrl: sourceUrl,
      categoryPath,
      condition: mapCondition(
        pickFirstString(
          listingNode?.condition,
          domAttributes.Zustand,
          domAttributes["Fahrzeugzustand"],
          description
        )
      ),
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
      priceText,
      publishedAt,
      shippingAmount: parsePrice(listingNode?.shipping?.amount ?? null),
      title
    },
    parserSignals: buildParserSignals({
      confidence: listingNode && Object.keys(domAttributes).length > 0 && images.length > 0 ? 0.96 : 0.82,
      extractionStrategy,
      missingFields: [
        !description && "description",
        !images.length && "images",
        !locationText && "location",
        !Object.keys(domAttributes).length && "attributes"
      ].filter(Boolean) as string[],
      warnings: listingNode ? [] : ["No __NEXT_DATA__ payload found; used DOM reconstruction."]
    }),
    seller,
    snapshot: {
      parserVersion: "kleinanzeigen-browser-v2",
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
