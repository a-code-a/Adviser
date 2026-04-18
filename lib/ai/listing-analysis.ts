import { OpenRouter } from "@openrouter/sdk";

import { DEFAULT_ANALYSIS_MODEL, DEFAULT_WEB_SEARCH_MAX_RESULTS } from "@/lib/core/config";
import {
  listingAnalysisJsonSchema,
  listingAnalysisSchema,
  type ListingAnalysis
} from "@/lib/core/analysis";
import { type NormalizedComparable } from "@/lib/core/marketplaces";
import { readEnvironment } from "@/lib/env";
import { average, ensureErrorMessage } from "@/lib/utils";

export interface AnalysisBundle {
  comparables: NormalizedComparable[];
  images?: Array<Record<string, any>>;
  listing: Record<string, any>;
  parserSignals: Record<string, any>;
  seller: Record<string, any> | null;
  snapshot?: Record<string, any> | null;
  target?: Record<string, any> | null;
}

interface AnalysisUsage {
  inputTokens: number;
  outputTokens: number;
  webSearchRequests: number;
}

export interface AnalysisResult {
  errorMessage: string | null;
  report: ListingAnalysis;
  usage: AnalysisUsage;
}

const STOP_WORDS = new Set([
  "and",
  "bei",
  "das",
  "der",
  "die",
  "ein",
  "eine",
  "for",
  "from",
  "für",
  "mit",
  "oder",
  "the",
  "und",
  "von"
]);

function cleanInlineText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string | null | undefined) {
  return cleanInlineText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function getListingPrice(listing: Record<string, any>) {
  const raw = listing.price_amount ?? listing.priceAmount ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getListingAttributes(listing: Record<string, any>) {
  return (listing.attributes ?? {}) as Record<string, unknown>;
}

function getAttributeValue(listing: Record<string, any>, keys: string[]) {
  const attributes = getListingAttributes(listing);

  for (const [key, value] of Object.entries(attributes)) {
    if (!keys.some((candidate) => key.toLowerCase() === candidate.toLowerCase())) {
      continue;
    }

    const normalized = cleanInlineText(typeof value === "string" ? value : String(value ?? ""));
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function buildAnchorTokens(listing: Record<string, any>) {
  const anchors = [
    ...tokenize(getAttributeValue(listing, ["Marke", "Brand"])),
    ...tokenize(getAttributeValue(listing, ["Modell", "Model"])),
    ...tokenize(listing.title)
  ];

  return [...new Set(anchors)].slice(0, 8);
}

function buildBrandTokens(listing: Record<string, any>) {
  return [...new Set(tokenize(getAttributeValue(listing, ["Marke", "Brand"])))];
}

function buildModelTokens(listing: Record<string, any>) {
  return [...new Set(tokenize(getAttributeValue(listing, ["Modell", "Model"])))];
}

function scoreComparableCandidate(listing: Record<string, any>, item: NormalizedComparable) {
  const anchorTokens = buildAnchorTokens(listing);
  const brandTokens = buildBrandTokens(listing);
  const modelTokens = buildModelTokens(listing);
  const listingTokens = new Set([
    ...anchorTokens,
    ...tokenize(Array.isArray(listing.category_path) ? listing.category_path.join(" ") : "")
  ]);
  const comparableTokens = new Set(tokenize(item.title));
  const sharedTokens = [...listingTokens].filter((token) => comparableTokens.has(token));
  const listingPrice = getListingPrice(listing);
  const comparablePrice = Number(item.priceAmount ?? 0);
  const priceRatio =
    listingPrice > 0 && comparablePrice > 0 ? comparablePrice / listingPrice : 1;
  const anchorHits = anchorTokens.filter((token) => comparableTokens.has(token)).length;
  const brandHits = brandTokens.filter((token) => comparableTokens.has(token)).length;
  const modelHits = modelTokens.filter((token) => comparableTokens.has(token)).length;

  let score = sharedTokens.length * 1.2 + anchorHits * 1.8 + (item.source === "live" ? 0.35 : 0);

  if (brandTokens.length > 0 && brandHits === 0) {
    score -= 3;
  }

  if (modelTokens.length > 0 && modelHits === 0) {
    score -= 4;
  }

  if (listingPrice > 0 && comparablePrice > 0) {
    if (priceRatio < 0.08 || priceRatio > 5) {
      score -= 4;
    } else if (priceRatio < 0.2 || priceRatio > 3) {
      score -= 2;
    }
  }

  return score;
}

function dedupeComparables(items: NormalizedComparable[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.marketplace}:${item.url}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function selectComparableCandidates(
  listing: Record<string, any>,
  comparables: NormalizedComparable[],
  limit = 6
) {
  const scored = dedupeComparables(comparables)
    .map((item) => ({
      item,
      score: scoreComparableCandidate(listing, item)
    }))
    .filter(({ score }) => score >= 2.4)
    .sort((left, right) => right.score - left.score || right.item.similarityScore - left.item.similarityScore)
    .slice(0, limit)
    .map(({ item }) => item);

  return scored;
}

function verdictFromPricing(listPrice: number, averageComparablePrice: number) {
  if (!averageComparablePrice) {
    return "fair" as const;
  }

  const ratio = listPrice / averageComparablePrice;

  if (ratio <= 0.72) {
    return "very_good_deal" as const;
  }

  if (ratio <= 0.9) {
    return "good_deal" as const;
  }

  if (ratio <= 1.12) {
    return "fair" as const;
  }

  if (ratio <= 1.3) {
    return "overpriced" as const;
  }

  return "high_risk" as const;
}

function recommendedActionFromVerdict(verdict: ListingAnalysis["priceVerdict"]) {
  if (verdict === "very_good_deal") {
    return "buy" as const;
  }

  if (verdict === "good_deal" || verdict === "fair") {
    return "negotiate" as const;
  }

  if (verdict === "overpriced") {
    return "verify_first" as const;
  }

  return "walk_away" as const;
}

function buildFallbackReport(bundle: AnalysisBundle, comparableCandidates: NormalizedComparable[], modelSlug: string): ListingAnalysis {
  const prices = comparableCandidates.map((item) => item.priceAmount).filter((value) => value > 0);
  const averageComparablePrice = average(prices);
  const listPrice = getListingPrice(bundle.listing);
  const verdict = verdictFromPricing(listPrice, averageComparablePrice);
  const sellerMissing = !bundle.seller?.rating_score && !bundle.seller?.ratingScore;
  const parserWarnings = bundle.parserSignals?.warnings ?? [];
  const riskScore = Math.min(
    95,
    24 +
      (sellerMissing ? 16 : 0) +
      (bundle.parserSignals?.missingFields?.length ?? 0) * 7 +
      parserWarnings.length * 4 +
      (verdict === "high_risk" ? 18 : verdict === "overpriced" ? 10 : 0)
  );

  return {
    citations: comparableCandidates.slice(0, 4).map((item) => ({
      label: `${item.marketplace} comparable`,
      url: item.url
    })),
    comparableItems: comparableCandidates.slice(0, 6).map((item) => ({
      condition: item.condition,
      currency: item.currency,
      marketplace: item.marketplace,
      priceAmount: item.priceAmount,
      reason: item.source === "internal" ? "Internal vector match" : "Live marketplace result",
      title: item.title,
      url: item.url
    })),
    confidence: prices.length > 0 ? 0.66 : 0.4,
    estimatedFairRange: {
      currency: bundle.listing.currency ?? "EUR",
      max: Number((averageComparablePrice || listPrice * 1.08).toFixed(2)),
      min: Number(((averageComparablePrice || listPrice) * 0.88).toFixed(2))
    },
    generationMode: "fallback",
    modelSlug,
    negotiationAdvice: [
      "Ask the seller to confirm the current condition with fresh photos or a short video before you commit.",
      "Use any missing paperwork, repairs, or wear as leverage when making an offer.",
      "Only negotiate after the seller answers your key condition and ownership questions."
    ],
    priceAssessment:
      prices.length > 0
        ? "The fallback estimate is based on prefiltered comparable candidates and should be treated as directional rather than final."
        : "No reliable comparable candidates were available, so the fallback estimate is anchored around the current asking price and uncertainty is high.",
    priceVerdict: verdict,
    questionsToAsk: [
      "Can you confirm all defects, repairs, and warning lights with fresh photos taken today?",
      "Is proof of purchase, service history, and the latest inspection paperwork available?",
      "What is included in the sale, and is anything missing compared with the original listing?"
    ],
    redFlags: [
      sellerMissing
        ? "Seller reputation signals are thin or unavailable."
        : "Seller looks established, but identity and ownership should still be verified before payment.",
      ...(bundle.parserSignals?.missingFields ?? []).map(
        (field: string) => `The scrape could not confidently verify ${field}.`
      )
    ],
    recommendedAction: recommendedActionFromVerdict(verdict),
    riskScore,
    sellerAssessment: sellerMissing
      ? "Seller profile is incomplete, so identity and trust should be validated manually."
      : "Seller profile includes some reputation signals, but they still need to be cross-checked against the listing and documents.",
    sellerMessageDraft:
      "Hallo, ich habe Interesse an deinem Angebot. Kannst du mir bitte aktuelle Fotos, Hinweise zu Mängeln oder Reparaturen und vorhandene Unterlagen schicken? Danke.",
    summary:
      verdict === "very_good_deal" || verdict === "good_deal"
        ? "The fallback pricing view suggests the listing may be worth pursuing, but condition and ownership still need to be checked directly."
        : "The fallback analysis indicates elevated uncertainty around value or trust, so the listing should be verified carefully before you proceed.",
    thingsToCheck: [
      "Compare the photos against the description for wear, mismatched parts, or hidden damage.",
      "Verify ownership, invoices, and service documents before paying anything.",
      "Use a safe payment and handover flow with pickup or protected payment if possible."
    ]
  };
}

function buildAnalysisPayload(bundle: AnalysisBundle, comparableCandidates: NormalizedComparable[], modelSlug: string) {
  const attributes = getListingAttributes(bundle.listing);

  return {
    analysisGoal:
      "Decide whether the listing is worth pursuing, whether the price looks fair, what the buyer should ask next, and whether the buyer should buy, negotiate, verify first, or walk away.",
    comparableCandidates,
    contextQuality: {
      attributeCount: Object.keys(attributes).length,
      imageCount: Array.isArray(bundle.images) ? bundle.images.length : 0,
      parserSignals: bundle.parserSignals,
      webSearchEnabled: readEnvironment().OPENROUTER_ENABLE_WEB_SEARCH
    },
    images: (bundle.images ?? []).slice(0, 12).map((image) => ({
      altText: image.alt_text ?? image.altText ?? null,
      url: image.image_url ?? image.url ?? null
    })),
    listing: {
      attributes,
      availability: bundle.listing.availability,
      canonicalUrl: bundle.listing.canonical_url ?? bundle.listing.canonicalUrl ?? bundle.target?.source_url ?? null,
      categoryPath: bundle.listing.category_path ?? bundle.listing.categoryPath ?? [],
      condition: bundle.listing.condition,
      currency: bundle.listing.currency,
      description: bundle.listing.description,
      externalId: bundle.listing.external_id ?? bundle.listing.externalId ?? null,
      locationText: bundle.listing.location_text ?? bundle.listing.locationText ?? null,
      marketplace: bundle.listing.marketplace ?? bundle.target?.marketplace ?? null,
      priceAmount: bundle.listing.price_amount ?? bundle.listing.priceAmount ?? null,
      priceText: bundle.listing.price_text ?? bundle.listing.priceText ?? null,
      publishedAt: bundle.listing.published_at ?? bundle.listing.publishedAt ?? null,
      shippingAmount: bundle.listing.shipping_amount ?? bundle.listing.shippingAmount ?? null,
      title: bundle.listing.title
    },
    modelSlug,
    seller: bundle.seller,
    source: {
      lastCrawledAt: bundle.target?.last_crawled_at ?? null,
      marketplace: bundle.target?.marketplace ?? bundle.listing.marketplace ?? null,
      sourceUrl: bundle.target?.source_url ?? bundle.snapshot?.source_url ?? null
    }
  };
}

function buildSearchPrompt(listing: Record<string, any>) {
  const anchors = buildAnchorTokens(listing).slice(0, 4).join(" ");
  const categoryPath = Array.isArray(listing.category_path) ? listing.category_path.join(" / ") : "";
  return `Find recent marketplace listings comparable to: ${listing.title}. Prioritize the same product category, same brand/model, same country or EU market, and similar condition. Ignore accessories, spare parts, and unrelated items. Category: ${categoryPath}. Anchor terms: ${anchors}.`;
}

function extractMessageContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text: unknown }).text);
        }

        return "";
      })
      .join("\n");
  }

  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }

  return "";
}

function extractJsonObjectText(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("Model returned an empty response.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    return candidate;
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return candidate.slice(start, end + 1);
  }

  throw new Error("Model response did not contain a JSON object.");
}

function parseModelReport(content: string, modelSlug: string) {
  return listingAnalysisSchema.parse({
    ...JSON.parse(extractJsonObjectText(content)),
    generationMode: "model",
    modelSlug
  });
}

export async function analyzeBundle(bundle: AnalysisBundle): Promise<AnalysisResult> {
  const env = readEnvironment();
  const modelSlug = env.OPENROUTER_MODEL_ANALYSIS || DEFAULT_ANALYSIS_MODEL;
  const comparableCandidates = selectComparableCandidates(bundle.listing, bundle.comparables, 6);
  const fallback = buildFallbackReport(bundle, comparableCandidates, modelSlug);

  if (!env.OPENROUTER_API_KEY) {
    return {
      errorMessage: "Missing OPENROUTER_API_KEY",
      report: fallback,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        webSearchRequests: 0
      }
    };
  }

  try {
    const client = new OpenRouter({
      apiKey: env.OPENROUTER_API_KEY,
      appCategories: "marketplace-advisor,deal-analysis",
      appTitle: "Marketplace Adviser",
      httpReferer: env.NEXT_PUBLIC_APP_URL
    });
    const messages = [
      {
        content:
          "You are a careful second-hand marketplace buying advisor. Use the provided listing context, seller signals, image metadata, parser warnings, snapshot metadata, and comparable candidates. Ignore unrelated comparables and say so when the evidence is weak. Do not invent facts.",
        role: "system" as const
      },
      {
        content:
          "Write the report in English. Keep seller questions and the seller message draft practical for a real buyer on a German marketplace. If evidence is weak, widen the fair range and lower confidence instead of pretending certainty.\n\n" +
          JSON.stringify(buildAnalysisPayload(bundle, comparableCandidates, modelSlug), null, 2),
        role: "user" as const
      }
    ];

    try {
      const response = await client.chat.send({
        chatRequest: {
          maxCompletionTokens: 2200,
          messages,
          model: modelSlug,
          plugins: env.OPENROUTER_ENABLE_WEB_SEARCH
            ? [
                {
                  id: "web",
                  maxResults: DEFAULT_WEB_SEARCH_MAX_RESULTS,
                  searchPrompt: buildSearchPrompt(bundle.listing)
                }
              ]
            : undefined,
          reasoning: {
            effort: "low"
          },
          responseFormat: {
            jsonSchema: {
              name: "listing_analysis",
              schema: listingAnalysisJsonSchema,
              strict: true
            },
            type: "json_schema"
          },
          stream: false,
          temperature: 0.2
        }
      });

      const report = parseModelReport(
        extractMessageContent(response.choices?.[0]?.message?.content),
        modelSlug
      );

      return {
        errorMessage: null,
        report,
        usage: {
          inputTokens: response.usage?.promptTokens ?? 0,
          outputTokens: response.usage?.completionTokens ?? 0,
          webSearchRequests: 0
        }
      };
    } catch (structuredError) {
      const retryResponse = await client.chat.send({
        chatRequest: {
          maxCompletionTokens: 2200,
          messages: [
            ...messages,
            {
              content:
                "Retry without tool or schema metadata. Return a single valid JSON object only. The JSON must match this schema exactly:\n" +
                JSON.stringify(listingAnalysisJsonSchema),
              role: "user"
            }
          ],
          model: modelSlug,
          reasoning: {
            effort: "low"
          },
          stream: false,
          temperature: 0.1
        }
      });

      const report = parseModelReport(
        extractMessageContent(retryResponse.choices?.[0]?.message?.content),
        modelSlug
      );

      return {
        errorMessage: `Structured pass failed: ${ensureErrorMessage(structuredError)}`,
        report,
        usage: {
          inputTokens: retryResponse.usage?.promptTokens ?? 0,
          outputTokens: retryResponse.usage?.completionTokens ?? 0,
          webSearchRequests: 0
        }
      };
    }
  } catch (error) {
    return {
      errorMessage: ensureErrorMessage(error),
      report: fallback,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        webSearchRequests: 0
      }
    };
  }
}
