import { z } from "zod";

export const QUEUE_NAMES = [
  "import_url",
  "crawl_seed",
  "refresh_listing",
  "analyze_listing",
  "dead_letter"
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

const baseJobSchema = z.object({
  attempt: z.number().int().min(0).default(0),
  listingId: z.string().uuid().optional(),
  requestedBy: z.string().uuid().optional()
});

export const importUrlJobSchema = baseJobSchema.extend({
  marketplace: z.enum(["ebay", "kleinanzeigen"]),
  sourceUrl: z.string().url()
});

export const crawlSeedJobSchema = baseJobSchema.extend({
  category: z.string().nullish(),
  crawlSeedId: z.string().uuid(),
  marketplace: z.enum(["ebay", "kleinanzeigen"]),
  query: z.string().min(1)
});

export const refreshListingJobSchema = baseJobSchema.extend({
  listingId: z.string().uuid(),
  reason: z.enum(["import", "manual_refresh", "tracking_refresh", "seed_discovery"])
});

export const analyzeListingJobSchema = baseJobSchema.extend({
  listingId: z.string().uuid()
});

export const deadLetterJobSchema = z.object({
  errorMessage: z.string(),
  originalMessage: z.record(z.string(), z.unknown()),
  queueName: z.enum(QUEUE_NAMES)
});

export type ImportUrlJob = z.infer<typeof importUrlJobSchema>;
export type CrawlSeedJob = z.infer<typeof crawlSeedJobSchema>;
export type RefreshListingJob = z.infer<typeof refreshListingJobSchema>;
export type AnalyzeListingJob = z.infer<typeof analyzeListingJobSchema>;
export type DeadLetterJob = z.infer<typeof deadLetterJobSchema>;
