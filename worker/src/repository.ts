import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { type MarketplaceName, type NormalizedComparable, type ScrapeListingResult } from "@/lib/core/marketplaces";

export class WorkerRepository {
  private readonly supabase = createSupabaseServiceClient();

  async readQueue(queueName: string, qty = 3, visibilityTimeout = 180) {
    const { data, error } = await this.supabase.rpc("worker_read_queue", {
      p_qty: qty,
      p_queue_name: queueName,
      p_visibility_timeout: visibilityTimeout
    });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as Array<Record<string, any>>;
  }

  async archiveMessage(queueName: string, msgId: number) {
    const { error } = await this.supabase.rpc("worker_archive_message", {
      p_msg_id: msgId,
      p_queue_name: queueName
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async sendQueueMessage(queueName: string, message: Record<string, unknown>, delaySeconds = 0) {
    const { error } = await this.supabase.rpc("worker_send_queue", {
      p_delay_seconds: delaySeconds,
      p_message: message,
      p_queue_name: queueName
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async getSourceControl(marketplace: MarketplaceName) {
    const { data, error } = await this.supabase
      .from("source_controls")
      .select("*")
      .eq("marketplace", marketplace)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as Record<string, any>;
  }

  async getCrawlTarget(listingId: string) {
    const { data, error } = await this.supabase.from("crawl_targets").select("*").eq("id", listingId).maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data as Record<string, any> | null;
  }

  async getSeed(seedId: string) {
    const { data, error } = await this.supabase.from("crawl_seeds").select("*").eq("id", seedId).maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data as Record<string, any> | null;
  }

  async upsertCrawlTarget(input: {
    listingId?: string | null;
    marketplace: MarketplaceName;
    sourceUrl: string;
    submittedBy?: string | null;
  }) {
    const payload = {
      id: input.listingId ?? undefined,
      marketplace: input.marketplace,
      source_url: input.sourceUrl,
      status: "queued",
      submitted_by: input.submittedBy ?? null,
      target_kind: "listing"
    };

    const { data, error } = await this.supabase
      .from("crawl_targets")
      .upsert(payload, { ignoreDuplicates: false, onConflict: "source_url" })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data.id as string;
  }

  async createRun(listingId: string | null, queueName: string, metadata: Record<string, unknown>) {
    const { data, error } = await this.supabase
      .from("crawl_runs")
      .insert({
        listing_id: listingId,
        metadata,
        queue_name: queueName,
        started_at: new Date().toISOString(),
        status: "running"
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data.id as string;
  }

  async finishRun(
    runId: string,
    input: {
      errorMessage?: string | null;
      rawSnapshotId?: string | null;
      status: "blocked" | "failed" | "queued" | "running" | "succeeded";
    }
  ) {
    const { error } = await this.supabase
      .from("crawl_runs")
      .update({
        error_message: input.errorMessage ?? null,
        finished_at: new Date().toISOString(),
        raw_snapshot_id: input.rawSnapshotId ?? null,
        status: input.status
      })
      .eq("id", runId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async updateTargetStatus(listingId: string, status: string, lastError?: string | null) {
    const { error } = await this.supabase
      .from("crawl_targets")
      .update({
        last_crawled_at: new Date().toISOString(),
        last_error: lastError ?? null,
        status
      })
      .eq("id", listingId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async recordBlock(input: {
    listingId: string;
    marketplace: MarketplaceName;
    reason: string;
    signature?: string | null;
    sourceUrl: string;
  }) {
    const { error } = await this.supabase.from("crawl_blocks").insert({
      crawl_target_id: input.listingId,
      marketplace: input.marketplace,
      reason: input.reason,
      signature: input.signature ?? null,
      source_url: input.sourceUrl
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async saveSnapshot(listingId: string, marketplace: MarketplaceName, result: ScrapeListingResult) {
    const { data, error } = await this.supabase
      .from("listing_snapshots")
      .insert({
        crawl_target_id: listingId,
        external_id: result.listing.externalId,
        is_blocked: false,
        marketplace,
        parser_signals: result.parserSignals,
        parser_version: result.snapshot.parserVersion,
        raw_html: result.snapshot.rawHtml ?? null,
        raw_payload: result.snapshot.rawPayload ?? null,
        scraped_at: result.snapshot.scrapedAt,
        source_url: result.snapshot.sourceUrl
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data.id as string;
  }

  async upsertSeller(marketplace: MarketplaceName, seller: ScrapeListingResult["seller"]) {
    const sellerKey = `${marketplace}:${seller.externalSellerId ?? seller.profileUrl ?? seller.name}`.toLowerCase();
    const { data, error } = await this.supabase
      .from("seller_profiles")
      .upsert(
        {
          badges: seller.badges,
          external_seller_id: seller.externalSellerId ?? null,
          is_commercial: seller.isCommercial ?? null,
          location_text: seller.locationText ?? null,
          marketplace,
          member_since_text: seller.memberSinceText ?? null,
          name: seller.name,
          profile_url: seller.profileUrl ?? null,
          rating_count: seller.ratingCount ?? null,
          rating_score: seller.ratingScore ?? null,
          seller_key: sellerKey
        },
        {
          ignoreDuplicates: false,
          onConflict: "seller_key"
        }
      )
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data.id as string;
  }

  async upsertListing(input: {
    embedding: number[];
    listingId: string;
    result: ScrapeListingResult;
    sellerProfileId: string | null;
    snapshotId: string;
  }) {
    const listing = input.result.listing;

    const { error } = await this.supabase.from("listings_normalized").upsert({
      attributes: listing.attributes,
      availability: listing.availability,
      canonical_url: listing.canonicalUrl,
      category_path: listing.categoryPath,
      condition: listing.condition,
      currency: listing.currency,
      description: listing.description,
      embedding: input.embedding,
      external_id: listing.externalId,
      id: input.listingId,
      image_count: input.result.images.length,
      is_active: true,
      last_seen_at: new Date().toISOString(),
      latest_snapshot_id: input.snapshotId,
      location_text: listing.locationText ?? null,
      marketplace: listing.marketplace,
      price_amount: listing.priceAmount,
      price_text: listing.priceText,
      primary_image_url: input.result.images[0]?.url ?? null,
      published_at: listing.publishedAt ?? null,
      seller_profile_id: input.sellerProfileId,
      shipping_amount: listing.shippingAmount ?? null,
      title: listing.title
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async replaceImages(listingId: string, images: ScrapeListingResult["images"]) {
    await this.supabase.from("listing_images").delete().eq("listing_id", listingId);

    if (images.length === 0) {
      return;
    }

    const { error } = await this.supabase.from("listing_images").insert(
      images.map((image) => ({
        alt_text: image.altText ?? null,
        image_url: image.url,
        listing_id: listingId,
        position: image.position
      }))
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  async saveComparables(listingId: string, comparables: NormalizedComparable[]) {
    await this.supabase.from("comparables").delete().eq("listing_id", listingId);

    if (comparables.length === 0) {
      return;
    }

    const { error } = await this.supabase.from("comparables").insert(
      comparables.map((item) => ({
        condition: item.condition,
        created_at: new Date().toISOString(),
        currency: item.currency,
        listing_id: listingId,
        metadata: {
          source: item.source
        },
        price_amount: item.priceAmount,
        similarity_score: item.similarityScore,
        source_marketplace: item.marketplace,
        source_url: item.url,
        title: item.title
      }))
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  async matchInternalComparables(listingId: string) {
    const { data, error } = await this.supabase.rpc("match_listing_vectors", {
      p_listing_id: listingId,
      p_match_count: 6
    });

    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as Array<Record<string, any>>).map(
      (row) =>
        ({
          condition: row.condition ?? "unknown",
          currency: row.currency ?? "EUR",
          marketplace: row.marketplace,
          priceAmount: row.price_amount ?? 0,
          similarityScore: Number(row.similarity_score ?? 0),
          source: "internal",
          title: row.title,
          url: row.canonical_url
        }) satisfies NormalizedComparable
    );
  }

  async getAnalysisBundle(listingId: string) {
    const { data: listing, error: listingError } = await this.supabase
      .from("listings_normalized")
      .select("*")
      .eq("id", listingId)
      .maybeSingle();

    if (listingError) {
      throw new Error(listingError.message);
    }

    const [{ data: seller }, { data: snapshot }] = await Promise.all([
      listing?.seller_profile_id
        ? this.supabase.from("seller_profiles").select("*").eq("id", listing.seller_profile_id).maybeSingle()
        : Promise.resolve({ data: null } as const),
      listing?.latest_snapshot_id
        ? this.supabase
            .from("listing_snapshots")
            .select("parser_signals")
            .eq("id", listing.latest_snapshot_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as const)
    ]);

    return {
      listing,
      parserSignals: snapshot?.parser_signals ?? {},
      seller
    };
  }

  async getInterestedUserIds(listingId: string) {
    const { data, error } = await this.supabase
      .from("tracked_listings")
      .select("user_id")
      .eq("listing_id", listingId);

    if (error) {
      throw new Error(error.message);
    }

    return [...new Set(((data ?? []) as Array<Record<string, any>>).map((row) => row.user_id as string))];
  }

  async saveAnalysisReports(input: {
    listingId: string;
    renderedSummary: string;
    report: Record<string, unknown>;
    tokenUsageInput: number;
    tokenUsageOutput: number;
    userIds: string[];
    webSearchRequests: number;
  }) {
    if (input.userIds.length === 0) {
      return;
    }

    const payload = input.userIds.map((userId) => ({
      created_at: new Date().toISOString(),
      listing_id: input.listingId,
      rendered_summary: input.renderedSummary,
      report_json: input.report,
      token_usage_input: input.tokenUsageInput,
      token_usage_output: input.tokenUsageOutput,
      updated_at: new Date().toISOString(),
      user_id: userId,
      web_search_requests: input.webSearchRequests
    }));

    const { error } = await this.supabase.from("analysis_reports").insert(payload);

    if (error) {
      throw new Error(error.message);
    }
  }

  async listDueTrackedListings(limit = 20) {
    const { data, error } = await this.supabase.rpc("worker_due_tracked_listings", {
      p_limit: limit
    });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as Array<Record<string, any>>;
  }
}
