import { z } from "zod";

export const priceVerdictSchema = z.enum([
  "very_good_deal",
  "good_deal",
  "fair",
  "overpriced",
  "high_risk"
]);

export const recommendedActionSchema = z.enum([
  "buy",
  "negotiate",
  "verify_first",
  "walk_away"
]);

export const generationModeSchema = z.enum(["model", "fallback"]);

const comparableReportSchema = z.object({
  condition: z.string(),
  currency: z.string(),
  marketplace: z.string(),
  priceAmount: z.number().nonnegative(),
  reason: z.string(),
  title: z.string(),
  url: z.string().url()
});

const citationSchema = z.object({
  label: z.string(),
  url: z.string().url()
});

export const listingAnalysisSchema = z.object({
  citations: z.array(citationSchema).default([]),
  comparableItems: z.array(comparableReportSchema).default([]),
  confidence: z.number().min(0).max(1),
  estimatedFairRange: z.object({
    currency: z.string(),
    max: z.number().nonnegative(),
    min: z.number().nonnegative()
  }),
  generationMode: generationModeSchema,
  modelSlug: z.string(),
  negotiationAdvice: z.array(z.string()).min(1),
  priceAssessment: z.string(),
  priceVerdict: priceVerdictSchema,
  questionsToAsk: z.array(z.string()).min(1),
  redFlags: z.array(z.string()).min(1),
  recommendedAction: recommendedActionSchema,
  riskScore: z.number().int().min(0).max(100),
  sellerAssessment: z.string(),
  sellerMessageDraft: z.string(),
  summary: z.string(),
  thingsToCheck: z.array(z.string()).min(1)
});

export type ListingAnalysis = z.infer<typeof listingAnalysisSchema>;

export const listingAnalysisJsonSchema = {
  additionalProperties: false,
  properties: {
    citations: {
      items: {
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          url: { format: "uri", type: "string" }
        },
        required: ["label", "url"],
        type: "object"
      },
      type: "array"
    },
    comparableItems: {
      items: {
        additionalProperties: false,
        properties: {
          condition: { type: "string" },
          currency: { type: "string" },
          marketplace: { type: "string" },
          priceAmount: { minimum: 0, type: "number" },
          reason: { type: "string" },
          title: { type: "string" },
          url: { format: "uri", type: "string" }
        },
        required: ["condition", "currency", "marketplace", "priceAmount", "reason", "title", "url"],
        type: "object"
      },
      type: "array"
    },
    confidence: {
      maximum: 1,
      minimum: 0,
      type: "number"
    },
    estimatedFairRange: {
      additionalProperties: false,
      properties: {
        currency: { type: "string" },
        max: { minimum: 0, type: "number" },
        min: { minimum: 0, type: "number" }
      },
      required: ["currency", "max", "min"],
      type: "object"
    },
    generationMode: {
      enum: ["model", "fallback"],
      type: "string"
    },
    modelSlug: { type: "string" },
    negotiationAdvice: {
      items: { type: "string" },
      minItems: 1,
      type: "array"
    },
    priceAssessment: { type: "string" },
    priceVerdict: {
      enum: ["very_good_deal", "good_deal", "fair", "overpriced", "high_risk"],
      type: "string"
    },
    questionsToAsk: {
      items: { type: "string" },
      minItems: 1,
      type: "array"
    },
    redFlags: {
      items: { type: "string" },
      minItems: 1,
      type: "array"
    },
    recommendedAction: {
      enum: ["buy", "negotiate", "verify_first", "walk_away"],
      type: "string"
    },
    riskScore: {
      maximum: 100,
      minimum: 0,
      type: "integer"
    },
    sellerAssessment: { type: "string" },
    sellerMessageDraft: { type: "string" },
    summary: { type: "string" },
    thingsToCheck: {
      items: { type: "string" },
      minItems: 1,
      type: "array"
    }
  },
  required: [
    "citations",
    "comparableItems",
    "confidence",
    "estimatedFairRange",
    "generationMode",
    "modelSlug",
    "negotiationAdvice",
    "priceAssessment",
    "priceVerdict",
    "questionsToAsk",
    "redFlags",
    "recommendedAction",
    "riskScore",
    "sellerAssessment",
    "sellerMessageDraft",
    "summary",
    "thingsToCheck"
  ],
  type: "object"
} as const;
