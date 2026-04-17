import "server-only";

import { ensureMarketplaceUrl } from "@/lib/core/marketplaces";
import { ensureErrorMessage } from "@/lib/utils";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DashboardCard {
  availability: string | null;
  createdAt: string;
  id: string;
  latestVerdict: string | null;
  marketplace: string;
  priceAmount: number | null;
  primaryImageUrl: string | null;
  sourceUrl: string;
  title: string;
  trackingState: string;
  updatedAt: string | null;
}

export interface DashboardData {
  importLimit: number;
  importsUsedToday: number;
  listings: DashboardCard[];
  refreshCooldownHours: number;
  trackedCount: number;
  trackedLimit: number;
}

export interface ListingDetailData {
  listing: Record<string, any> | null;
  report: Record<string, any> | null;
  seller: Record<string, any> | null;
  target: Record<string, any> | null;
  trackedListing: Record<string, any> | null;
}

function requireConfiguredSupabase() {
  return createSupabaseServerClient();
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const supabase = await requireConfiguredSupabase();

  const [{ data: quota }, { data: trackedRows }] = await Promise.all([
    supabase.from("user_quotas").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("tracked_listings")
      .select(
        `
          listing_id,
          tracking_state,
          created_at,
          crawl_targets!inner(
            id,
            marketplace,
            source_url,
            status,
            last_crawled_at,
            last_error
          )
        `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  ]);

  const listingIds = ((trackedRows ?? []) as Array<Record<string, any>>).map((row) => row.listing_id);
  const listingById = new Map<string, Record<string, any>>();

  if (listingIds.length > 0) {
    const { data: listingRows } = await supabase
      .from("listings_normalized")
      .select("id, title, price_amount, availability, primary_image_url, updated_at")
      .in("id", listingIds);

    for (const row of (listingRows ?? []) as Array<Record<string, any>>) {
      listingById.set(row.id, row);
    }
  }

  const reportMap = new Map<string, string>();

  if (listingIds.length > 0) {
    const { data: reportRows } = await supabase
      .from("analysis_reports")
      .select("listing_id, created_at, report_json")
      .eq("user_id", userId)
      .in("listing_id", listingIds)
      .order("created_at", { ascending: false });

    for (const row of (reportRows ?? []) as Array<Record<string, any>>) {
      if (!reportMap.has(row.listing_id)) {
        reportMap.set(row.listing_id, row.report_json?.priceVerdict ?? null);
      }
    }
  }

  const cards: DashboardCard[] = ((trackedRows ?? []) as Array<Record<string, any>>).map((row) => {
    const target = row.crawl_targets ?? {};
    const listing = listingById.get(row.listing_id) ?? null;

    return {
      availability: listing?.availability ?? target.status ?? null,
      createdAt: row.created_at,
      id: row.listing_id,
      latestVerdict: reportMap.get(row.listing_id) ?? null,
      marketplace: target.marketplace ?? "unknown",
      priceAmount: listing?.price_amount ?? null,
      primaryImageUrl: listing?.primary_image_url ?? null,
      sourceUrl: target.source_url ?? "",
      title: listing?.title ?? "Queued listing",
      trackingState: row.tracking_state,
      updatedAt: listing?.updated_at ?? target.last_crawled_at ?? null
    };
  });

  const activeTrackedCount = cards.filter((card) => card.trackingState === "active").length;

  return {
    importLimit: quota?.import_limit ?? 5,
    importsUsedToday: quota?.imports_used_today ?? 0,
    listings: cards,
    refreshCooldownHours: quota?.refresh_cooldown_hours ?? 6,
    trackedCount: activeTrackedCount,
    trackedLimit: quota?.tracked_limit ?? 20
  };
}

export async function getListingDetail(userId: string, listingId: string): Promise<ListingDetailData> {
  const supabase = await requireConfiguredSupabase();

  const [{ data: trackedListing }, { data: target }, { data: listing }, { data: report }] = await Promise.all([
    supabase
      .from("tracked_listings")
      .select("*")
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .maybeSingle(),
    supabase.from("crawl_targets").select("*").eq("id", listingId).maybeSingle(),
    supabase.from("listings_normalized").select("*").eq("id", listingId).maybeSingle(),
    supabase
      .from("analysis_reports")
      .select("*")
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (!trackedListing) {
    return {
      listing: null,
      report: null,
      seller: null,
      target: null,
      trackedListing: null
    };
  }

  const [{ data: seller }, { data: images }] = await Promise.all([
    listing?.seller_profile_id
      ? supabase.from("seller_profiles").select("*").eq("id", listing.seller_profile_id).maybeSingle()
      : Promise.resolve({ data: null } as const),
    supabase.from("listing_images").select("*").eq("listing_id", listingId).order("position")
  ]);

  return {
    listing: listing ? { ...listing, listing_images: images ?? [] } : null,
    report,
    seller,
    target,
    trackedListing
  };
}

export async function getReport(userId: string, reportId: string) {
  const supabase = await requireConfiguredSupabase();

  const { data } = await supabase
    .from("analysis_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("id", reportId)
    .maybeSingle();

  return data;
}

export async function importListingForViewer(userId: string, sourceUrl: string) {
  const supabase = await requireConfiguredSupabase();
  const { marketplace, normalizedUrl } = ensureMarketplaceUrl(sourceUrl);
  const { data, error } = await supabase.rpc("app_import_listing", {
    p_marketplace: marketplace,
    p_source_url: normalizedUrl
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function enableTrackingForViewer(listingId: string) {
  const supabase = await requireConfiguredSupabase();
  const { error } = await supabase.rpc("app_track_listing", {
    p_listing_id: listingId
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function requestRefreshForViewer(listingId: string) {
  const supabase = await requireConfiguredSupabase();
  const { error } = await supabase.rpc("app_request_refresh", {
    p_listing_id: listingId
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function enqueueSeedForAdmin(input: {
  category?: string | null;
  marketplace: "ebay" | "kleinanzeigen";
  query: string;
}) {
  const supabase = await requireConfiguredSupabase();
  const { error } = await supabase.rpc("app_admin_enqueue_seed", {
    p_category: input.category ?? null,
    p_marketplace: input.marketplace,
    p_query: input.query
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getAdminOverview() {
  const supabase = createSupabaseServiceClient();

  const [{ data: queues }, { data: sourceControls }, { data: recentBlocks }] = await Promise.all([
    supabase.rpc("admin_queue_metrics"),
    supabase.from("source_controls").select("*").order("marketplace"),
    supabase.from("crawl_blocks").select("*").order("detected_at", { ascending: false }).limit(10)
  ]);

  return {
    queues: (queues ?? []) as Array<Record<string, any>>,
    recentBlocks: (recentBlocks ?? []) as Array<Record<string, any>>,
    sourceControls: (sourceControls ?? []) as Array<Record<string, any>>
  };
}

export async function syncUserProfileMetadata() {
  try {
    const supabase = await requireConfiguredSupabase();
    await supabase.rpc("app_touch_current_user");
  } catch (error) {
    console.error("Failed to sync profile metadata:", ensureErrorMessage(error));
  }
}
