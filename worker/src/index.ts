import "./load-env";

import { createServer } from "node:http";

import { buildHashEmbedding } from "./embedding";
import { WorkerRepository } from "./repository";
import { analyzeBundle } from "./analysis";
import { getMarketplaceAdapter } from "./adapters";
import { SourceBlockedError } from "./adapters/shared";

import {
  analyzeListingJobSchema,
  crawlSeedJobSchema,
  deadLetterJobSchema,
  importUrlJobSchema,
  refreshListingJobSchema,
  type QueueName
} from "@/lib/core/queues";
import { type MarketplaceName, type NormalizedComparable } from "@/lib/core/marketplaces";
import { readEnvironment } from "@/lib/env";
import { ensureErrorMessage } from "@/lib/utils";

const repository = new WorkerRepository();
const env = readEnvironment();
const queueOrder: QueueName[] = ["import_url", "crawl_seed", "refresh_listing", "analyze_listing"];
let isProcessing = false;

async function retryOrDeadLetter(
  queueName: QueueName,
  message: Record<string, any>,
  error: unknown
) {
  const attempt = Number(message.attempt ?? 0);
  const errorMessage = ensureErrorMessage(error);

  if (attempt < 2) {
    await repository.sendQueueMessage(
      queueName,
      {
        ...message,
        attempt: attempt + 1
      },
      queueName === "refresh_listing" ? 300 : 120
    );
    return;
  }

  deadLetterJobSchema.parse({
    errorMessage,
    originalMessage: message,
    queueName
  });

  await repository.sendQueueMessage("dead_letter", {
    errorMessage,
    originalMessage: message,
    queueName
  });
}

async function handleImportUrl(payload: Record<string, any>) {
  const job = importUrlJobSchema.parse(payload);
  const listingId = await repository.upsertCrawlTarget({
    listingId: job.listingId,
    marketplace: job.marketplace,
    sourceUrl: job.sourceUrl,
    submittedBy: job.requestedBy ?? null
  });

  await repository.sendQueueMessage("refresh_listing", {
    attempt: 0,
    listingId,
    reason: "import",
    requestedBy: job.requestedBy ?? null
  });
}

async function handleSeed(payload: Record<string, any>) {
  const job = crawlSeedJobSchema.parse(payload);
  const sourceControl = await repository.getSourceControl(job.marketplace);

  if (!sourceControl.enabled || !sourceControl.seed_enabled) {
    throw new Error(`${job.marketplace} seed crawling is disabled.`);
  }

  const adapter = getMarketplaceAdapter(job.marketplace);
  const results = await adapter.search({
    category: job.category ?? null,
    query: job.query
  });

  for (const url of results.discoveredUrls) {
    const listingId = await repository.upsertCrawlTarget({
      marketplace: job.marketplace,
      sourceUrl: url,
      submittedBy: job.requestedBy ?? null
    });

    await repository.sendQueueMessage("refresh_listing", {
      attempt: 0,
      listingId,
      reason: "seed_discovery",
      requestedBy: job.requestedBy ?? null
    });
  }
}

async function gatherLiveComparables(marketplace: MarketplaceName, title: string) {
  const adapter = getMarketplaceAdapter(marketplace);
  const result = await adapter.search({
    query: title
  });

  return ((result.metadata?.items as NormalizedComparable[] | undefined) ?? []).slice(0, 6);
}

async function handleRefresh(payload: Record<string, any>) {
  const job = refreshListingJobSchema.parse(payload);
  const target = await repository.getCrawlTarget(job.listingId);

  if (!target) {
    throw new Error(`Missing crawl target for ${job.listingId}`);
  }

  const sourceControl = await repository.getSourceControl(target.marketplace as MarketplaceName);
  if (!sourceControl.enabled) {
    throw new Error(`${target.marketplace} is disabled.`);
  }

  const runId = await repository.createRun(job.listingId, "refresh_listing", {
    reason: job.reason
  });

  try {
    const adapter = getMarketplaceAdapter(target.marketplace as MarketplaceName);
    const result = await adapter.fetchListing({
      url: target.source_url
    });
    const snapshotId = await repository.saveSnapshot(
      job.listingId,
      target.marketplace as MarketplaceName,
      result
    );
    const sellerProfileId = await repository.upsertSeller(target.marketplace as MarketplaceName, result.seller);
    const embedding = buildHashEmbedding(
      `${result.listing.title}\n${result.listing.description}\n${result.listing.categoryPath.join(" ")}`
    );

    await repository.upsertListing({
      embedding,
      listingId: job.listingId,
      result,
      sellerProfileId,
      snapshotId
    });
    await repository.replaceImages(job.listingId, result.images);
    await repository.updateTargetStatus(job.listingId, "ready");
    await repository.finishRun(runId, {
      rawSnapshotId: snapshotId,
      status: "succeeded"
    });

    await repository.sendQueueMessage("analyze_listing", {
      attempt: 0,
      listingId: job.listingId
    });
  } catch (error) {
    if (error instanceof SourceBlockedError) {
      await repository.recordBlock({
        listingId: job.listingId,
        marketplace: target.marketplace as MarketplaceName,
        reason: error.message,
        signature: error.signature,
        sourceUrl: target.source_url
      });
      await repository.updateTargetStatus(job.listingId, "blocked", error.message);
      await repository.finishRun(runId, {
        errorMessage: error.message,
        status: "blocked"
      });
      return;
    }

    await repository.updateTargetStatus(job.listingId, "failed", ensureErrorMessage(error));
    await repository.finishRun(runId, {
      errorMessage: ensureErrorMessage(error),
      status: "failed"
    });
    throw error;
  }
}

async function handleAnalyze(payload: Record<string, any>) {
  const job = analyzeListingJobSchema.parse(payload);
  const bundle = await repository.getAnalysisBundle(job.listingId);

  if (!bundle.listing) {
    throw new Error(`Listing ${job.listingId} is missing normalized data.`);
  }

  const internalComparables = await repository.matchInternalComparables(job.listingId);
  const liveComparables = await gatherLiveComparables(
    bundle.listing.marketplace as MarketplaceName,
    bundle.listing.title
  ).catch(() => []);
  const reportResult = await analyzeBundle({
    comparables: [...internalComparables, ...liveComparables].slice(0, 8),
    listing: bundle.listing,
    parserSignals: bundle.parserSignals,
    seller: bundle.seller
  });
  const userIds = await repository.getInterestedUserIds(job.listingId);

  await repository.saveComparables(job.listingId, [...internalComparables, ...liveComparables].slice(0, 8));
  await repository.saveAnalysisReports({
    listingId: job.listingId,
    renderedSummary: reportResult.report.summary,
    report: reportResult.report,
    tokenUsageInput: reportResult.usage.inputTokens,
    tokenUsageOutput: reportResult.usage.outputTokens,
    userIds,
    webSearchRequests: reportResult.usage.webSearchRequests
  });
}

async function handleQueueMessage(queueName: QueueName, messageRecord: Record<string, any>) {
  const message = messageRecord.message as Record<string, any>;

  try {
    if (queueName === "import_url") {
      await handleImportUrl(message);
    }

    if (queueName === "crawl_seed") {
      await handleSeed(message);
    }

    if (queueName === "refresh_listing") {
      await handleRefresh(message);
    }

    if (queueName === "analyze_listing") {
      await handleAnalyze(message);
    }
  } catch (error) {
    await retryOrDeadLetter(queueName, message, error);
    throw error;
  } finally {
    await repository.archiveMessage(queueName, Number(messageRecord.msg_id));
  }
}

async function processQueuesOnce() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    for (const queueName of queueOrder) {
      try {
        const messages = await repository.readQueue(queueName, 2);

        for (const message of messages) {
          try {
            await handleQueueMessage(queueName, message);
          } catch (error) {
            console.error(`Queue ${queueName} failed:`, ensureErrorMessage(error));
          }
        }
      } catch (error) {
        console.error(`Unable to read queue ${queueName}:`, ensureErrorMessage(error));
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function enqueueDueTrackedListings() {
  const dueListings = await repository.listDueTrackedListings(20);

  for (const row of dueListings) {
    await repository.sendQueueMessage("refresh_listing", {
      attempt: 0,
      listingId: row.listing_id,
      reason: "tracking_refresh"
    });
  }
}

function writeJson(response: import("node:http").ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function isAuthorized(request: import("node:http").IncomingMessage) {
  if (!env.WORKER_AUTH_TOKEN) {
    return true;
  }

  return request.headers.authorization === `Bearer ${env.WORKER_AUTH_TOKEN}`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost:8080"}`);

  if (request.method === "GET" && url.pathname === "/healthz") {
    writeJson(response, 200, { ok: true, service: "marketplace-advisor-worker" });
    return;
  }

  if (!isAuthorized(request)) {
    writeJson(response, 401, { error: "Unauthorized" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/run-once") {
    await processQueuesOnce();
    writeJson(response, 202, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/cron/refresh-tracked") {
    await enqueueDueTrackedListings();
    writeJson(response, 202, { ok: true });
    return;
  }

  writeJson(response, 404, { error: "Not found" });
});

const port = Number(process.env.PORT ?? 8080);

server.listen(port, () => {
  console.log(`Worker listening on :${port}`);
});

setInterval(() => {
  void processQueuesOnce();
}, 5000);
