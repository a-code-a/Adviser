import { OpenRouter } from "@openrouter/sdk";

import { DEFAULT_ANALYSIS_MODEL, DEFAULT_WEB_SEARCH_MAX_RESULTS } from "@/lib/core/config";
import { listingAnalysisJsonSchema, listingAnalysisSchema, type ListingAnalysis } from "@/lib/core/analysis";
import { type NormalizedComparable } from "@/lib/core/marketplaces";
import { readEnvironment } from "@/lib/env";
import { average } from "@/lib/utils";

interface AnalysisBundle {
  comparables: NormalizedComparable[];
  listing: Record<string, any>;
  parserSignals: Record<string, any>;
  seller: Record<string, any> | null;
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

function buildFallbackReport(bundle: AnalysisBundle): ListingAnalysis {
  const prices = bundle.comparables.map((item) => item.priceAmount).filter((value) => value > 0);
  const averageComparablePrice = average(prices);
  const listPrice = Number(bundle.listing.price_amount ?? bundle.listing.priceAmount ?? 0);
  const verdict = verdictFromPricing(listPrice, averageComparablePrice);
  const sellerMissing = !bundle.seller?.rating_score && !bundle.seller?.ratingScore;
  const parserWarnings = bundle.parserSignals?.warnings ?? [];
  const riskScore = Math.min(
    95,
    22 +
      (sellerMissing ? 18 : 0) +
      (bundle.parserSignals?.missingFields?.length ?? 0) * 8 +
      parserWarnings.length * 4 +
      (verdict === "high_risk" ? 24 : verdict === "overpriced" ? 14 : 0)
  );

  return {
    citations: bundle.comparables.slice(0, 4).map((item) => ({
      label: `${item.marketplace} comparable`,
      url: item.url
    })),
    comparableItems: bundle.comparables.slice(0, 6).map((item) => ({
      condition: item.condition,
      currency: item.currency,
      marketplace: item.marketplace,
      priceAmount: item.priceAmount,
      reason: item.source === "internal" ? "Internal vector match" : "Live marketplace result",
      title: item.title,
      url: item.url
    })),
    confidence: prices.length > 0 ? 0.74 : 0.48,
    estimatedFairRange: {
      currency: bundle.listing.currency ?? "EUR",
      max: Number((averageComparablePrice || listPrice * 1.05).toFixed(2)),
      min: Number(((averageComparablePrice || listPrice) * 0.86).toFixed(2))
    },
    priceVerdict: verdict,
    questionsToAsk: [
      "Can the seller confirm defects, repairs, and the exact current condition with fresh photos?",
      "Is the invoice or proof of purchase still available?",
      "Are all accessories and original parts included?"
    ],
    redFlags: [
      sellerMissing
        ? "Seller reputation signals are thin or unavailable."
        : "Seller looks established, but cross-check the profile against the listing details.",
      ...(bundle.parserSignals?.missingFields ?? []).map(
        (field: string) => `The scrape could not verify ${field}.`
      )
    ],
    riskScore,
    sellerAssessment: sellerMissing
      ? "Seller profile is incomplete, so identity and trust should be validated manually."
      : "Seller profile includes some reputation signals, but they should still be confirmed before payment.",
    summary:
      verdict === "very_good_deal" || verdict === "good_deal"
        ? "Pricing looks attractive against the available comparables, but confirm condition and seller legitimacy."
        : "This listing needs closer scrutiny because pricing or missing seller signals increase the purchase risk.",
    thingsToCheck: [
      "Compare the photos against the description for wear, mismatched parts, or hidden damage.",
      "Ask for serial numbers or proof of ownership when relevant.",
      "Verify whether pickup, insured shipping, or buyer protection is available."
    ]
  };
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

export async function analyzeBundle(bundle: AnalysisBundle) {
  const env = readEnvironment();
  const fallback = buildFallbackReport(bundle);

  if (!env.OPENROUTER_API_KEY) {
    return {
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
      apiKey: env.OPENROUTER_API_KEY
    });

    const response = await client.chat.send({
      messages: [
        {
          content:
            "You are a used-goods buying advisor. Judge whether the price is reasonable, what to watch out for, and which checks the buyer should perform. Return strict JSON only.",
          role: "system"
        },
        {
          content: JSON.stringify(
            {
              comparables: bundle.comparables,
              fallback,
              listing: bundle.listing,
              parserSignals: bundle.parserSignals,
              seller: bundle.seller
            },
            null,
            2
          ),
          role: "user"
        }
      ],
      model: env.OPENROUTER_MODEL_ANALYSIS || DEFAULT_ANALYSIS_MODEL,
      responseFormat: {
        jsonSchema: {
          name: "listing_analysis",
          schema: listingAnalysisJsonSchema,
          strict: true
        },
        type: "json_schema"
      },
      stream: false,
      temperature: 0.2,
      tools: env.OPENROUTER_ENABLE_WEB_SEARCH
        ? [
            {
              parameters: {
                max_results: DEFAULT_WEB_SEARCH_MAX_RESULTS,
                max_total_results: DEFAULT_WEB_SEARCH_MAX_RESULTS * 2
              },
              type: "openrouter:web_search"
            } as any
          ]
        : undefined
    } as any);

    const content = extractMessageContent((response as any).choices?.[0]?.message?.content);
    const report = listingAnalysisSchema.parse(JSON.parse(content));
    const usage = (response as any).usage ?? {};
    const toolUsage = usage.server_tool_use ?? usage.serverToolUse ?? {};

    return {
      report,
      usage: {
        inputTokens: usage.input_tokens ?? usage.inputTokens ?? 0,
        outputTokens: usage.output_tokens ?? usage.outputTokens ?? 0,
        webSearchRequests: toolUsage.web_search_requests ?? toolUsage.webSearchRequests ?? 0
      }
    };
  } catch {
    return {
      report: fallback,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        webSearchRequests: 0
      }
    };
  }
}
