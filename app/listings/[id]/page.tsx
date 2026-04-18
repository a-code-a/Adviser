import Link from "next/link";
import { notFound } from "next/navigation";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { requireViewer } from "@/lib/server/auth";
import { getListingDetail } from "@/lib/server/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ListingActions } from "@/components/listings/listing-actions";
import { StatusPill } from "@/components/common/status-pill";

interface ListingPageProps {
  params: Promise<{
    id: string;
  }>;
}

function formatRawDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium"
  }).format(parsed);
}

function formatVerdictLabel(value: string) {
  return value.replaceAll("_", " ");
}

function verdictIntent(value: string | null | undefined): "danger" | "neutral" | "success" | "warning" {
  if (!value) {
    return "neutral";
  }

  if (value === "fair") {
    return "warning";
  }

  if (value === "good_deal" || value === "very_good_deal") {
    return "success";
  }

  return "danger";
}

function attributeEntriesFromListing(listing: Record<string, any> | null) {
  return Object.entries((listing?.attributes ?? {}) as Record<string, unknown>)
    .map(([key, value]) => [key, typeof value === "string" ? value.trim() : String(value ?? "").trim()] as const)
    .filter(([key, value]) => key.trim() && value);
}

export default async function ListingPage({ params }: ListingPageProps) {
  if (!hasSupabaseBrowserConfig()) {
    return (
      <section className="panel stack gap-sm">
        <h1>Supabase is not configured</h1>
        <p className="muted">Add environment variables before opening listing detail routes.</p>
      </section>
    );
  }

  const { id } = await params;
  const viewer = await requireViewer();
  const detail = await getListingDetail(viewer.id, id);

  if (!detail.trackedListing) {
    notFound();
  }

  const listing = detail.listing;
  const report = detail.report?.report_json ?? null;
  const images = Array.isArray(listing?.listing_images) ? listing.listing_images : [];
  const sourceUrl = listing?.canonical_url ?? detail.target?.source_url ?? "";
  const attributeEntries = attributeEntriesFromListing(listing);
  const highlightEntry = attributeEntries.find(([key]) => /ausstattung|features|highlights/i.test(key));
  const detailEntries = attributeEntries.filter(([key]) => key !== highlightEntry?.[0]);
  const highlights =
    highlightEntry?.[1]
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  const sellerBadges = Array.isArray(detail.seller?.badges)
    ? detail.seller.badges.map((badge: unknown) => String(badge).trim()).filter(Boolean)
    : [];
  const comparableItems = Array.isArray(report?.comparableItems) ? report.comparableItems : [];
  const citations = Array.isArray(report?.citations) ? report.citations : [];
  const heroImage = images[0] ?? null;
  const quickFacts = [
    {
      label: "Marketplace",
      value: detail.target?.marketplace ?? listing?.marketplace ?? "Unknown"
    },
    {
      label: "Location",
      value: listing?.location_text ?? detail.seller?.location_text ?? "Unknown"
    },
    {
      label: "Published",
      value: formatRawDate(listing?.published_at)
    },
    {
      label: "Category",
      value: Array.isArray(listing?.category_path) && listing.category_path.length > 0
        ? listing.category_path.join(" / ")
        : "Unknown"
    },
    {
      label: "Condition",
      value: listing?.condition ?? "unknown"
    },
    {
      label: "Last crawl",
      value: formatDate(detail.target?.last_crawled_at)
    },
    {
      label: "Shipping",
      value: listing?.shipping_amount ? formatCurrency(listing.shipping_amount, listing?.currency ?? "EUR") : "Not listed"
    },
    {
      label: "Listing ID",
      value: listing?.external_id ?? detail.target?.id ?? "Unknown"
    }
  ];

  return (
    <div className="listing-shell stack gap-lg">
      <section className="listing-hero-grid">
        <article className="panel listing-gallery-card stack gap-sm">
          {heroImage ? (
            <>
              <div className="listing-main-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={heroImage.alt_text ?? listing?.title ?? "Listing image"}
                  src={heroImage.image_url}
                />
              </div>
              {images.length > 1 ? (
                <div className="listing-thumb-grid">
                  {images.slice(1, 7).map((image: Record<string, any>) => (
                    <div className="listing-thumb" key={image.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={image.alt_text ?? listing?.title ?? "Listing image"} src={image.image_url} />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="listing-main-image listing-main-image--empty">
              <span className="muted">No images normalized yet.</span>
            </div>
          )}
        </article>

        <div className="stack gap-md">
          <article className="panel stack gap-md">
            <div className="row gap-xs wrap">
              <StatusPill label={(detail.target?.marketplace ?? "queued").toUpperCase()} />
              <StatusPill intent="neutral" label={detail.trackedListing?.tracking_state ?? "observed"} />
              <StatusPill intent="neutral" label={listing?.availability ?? detail.target?.status ?? "queued"} />
              {report?.priceVerdict ? (
                <StatusPill intent={verdictIntent(report.priceVerdict)} label={formatVerdictLabel(report.priceVerdict)} />
              ) : null}
            </div>

            <div className="stack gap-sm">
              <h1>{listing?.title ?? "Listing queued for processing"}</h1>
              <div className="stack gap-xs">
                <strong className="price-display">{formatCurrency(listing?.price_amount, listing?.currency ?? "EUR")}</strong>
                {listing?.price_text ? <span className="muted">{listing.price_text}</span> : null}
              </div>
              {sourceUrl ? (
                <a className="source-link" href={sourceUrl} rel="noreferrer" target="_blank">
                  {sourceUrl}
                </a>
              ) : null}
            </div>

            <div className="facts-grid">
              {quickFacts.map((fact) => (
                <div className="fact-card" key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>

            <ListingActions listingId={id} trackingState={detail.trackedListing?.tracking_state} />
          </article>

          <aside className="panel seller-card stack gap-sm">
            <div className="row space-between baseline wrap gap-sm">
              <h2>Seller signals</h2>
              {detail.seller?.is_commercial === true ? <StatusPill intent="warning" label="commercial" /> : null}
            </div>
            {detail.seller ? (
              <>
                <p><strong>{detail.seller.name}</strong></p>
                <p className="muted">{detail.seller.location_text ?? "No location available"}</p>
                {detail.seller.rating_score ? (
                  <p className="muted">
                    Rating {detail.seller.rating_score} from {detail.seller.rating_count ?? 0} reviews
                  </p>
                ) : null}
                {detail.seller.member_since_text ? <p className="muted">{detail.seller.member_since_text}</p> : null}
                {sellerBadges.length > 0 ? (
                  <div className="badge-list">
                    {sellerBadges.map((badge) => (
                      <span className="badge-chip" key={badge}>
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">Seller details will appear after the first successful normalization.</p>
            )}
          </aside>
        </div>
      </section>

      <section className="grid-two listing-content-grid">
        <article className="panel stack gap-sm">
          <div className="row space-between baseline wrap">
            <h2>Listing facts</h2>
            <span className="muted">{detailEntries.length} extracted fields</span>
          </div>
          {detailEntries.length > 0 ? (
            <div className="detail-list">
              {detailEntries.map(([key, value]) => (
                <div className="detail-row" key={key}>
                  <span className="detail-key">{key}</span>
                  <strong className="detail-value">{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Structured facts will appear after the scraper extracts the listing detail grid.</p>
          )}

          {highlights.length > 0 ? (
            <div className="stack gap-sm">
              <h3>Highlights</h3>
              <div className="badge-list">
                {highlights.map((highlight) => (
                  <span className="badge-chip" key={highlight}>
                    {highlight}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel stack gap-sm">
          <h2>Description</h2>
          {listing?.description ? (
            <p className="text-pretty">{listing.description}</p>
          ) : (
            <p className="muted">Description text will appear after the first successful normalization.</p>
          )}
        </article>
      </section>

      <section className="stack gap-md">
        <div className="row space-between baseline wrap">
          <h2>Analysis report</h2>
          {detail.report?.id ? (
            <Link className="button button--ghost" href={`/api/reports/${detail.report.id}`}>
              Raw JSON
            </Link>
          ) : null}
        </div>

        {!report ? (
          <article className="panel stack gap-sm">
            <h3>Analysis pending</h3>
            <p className="muted">
              The listing has been queued, but the normalized snapshot or AI report is not ready
              yet. Check back after the worker processes the queue.
            </p>
            {detail.target?.last_error ? <p className="muted">Last error: {detail.target.last_error}</p> : null}
          </article>
        ) : (
          <div className="grid-two report-grid">
            <article className="panel stack gap-sm">
              <h3>{report.summary}</h3>
              <p className="muted">{report.sellerAssessment}</p>
              <div className="metric-grid">
                <div>
                  <strong>{report.riskScore}/100</strong>
                  <span>Risk score</span>
                </div>
                <div>
                  <strong>{report.confidence}</strong>
                  <span>Model confidence</span>
                </div>
                <div>
                  <strong>{formatCurrency(report.estimatedFairRange.min, report.estimatedFairRange.currency)}</strong>
                  <span>Fair range min</span>
                </div>
                <div>
                  <strong>{formatCurrency(report.estimatedFairRange.max, report.estimatedFairRange.currency)}</strong>
                  <span>Fair range max</span>
                </div>
              </div>
            </article>

            <article className="panel stack gap-sm">
              <h3>Things to check</h3>
              <ul className="plain-list">
                {report.thingsToCheck.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="panel stack gap-sm">
              <h3>Red flags</h3>
              <ul className="plain-list">
                {report.redFlags.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="panel stack gap-sm">
              <h3>Questions to ask</h3>
              <ul className="plain-list">
                {report.questionsToAsk.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        )}
      </section>

      {comparableItems.length > 0 ? (
        <section className="stack gap-md">
          <h2>Market comparables</h2>
          <div className="comparable-grid">
            {comparableItems.map((item: Record<string, any>) => (
              <article className="panel comparable-card stack gap-sm" key={item.url}>
                <div className="row space-between baseline wrap gap-sm">
                  <h3 className="clamp-2">{item.title}</h3>
                  <strong>{formatCurrency(item.priceAmount, item.currency)}</strong>
                </div>
                <p className="muted">{item.reason}</p>
                <div className="row gap-sm wrap">
                  <StatusPill intent="neutral" label={item.marketplace} />
                  <StatusPill intent="neutral" label={item.condition} />
                </div>
                <a className="source-link" href={item.url} rel="noreferrer" target="_blank">
                  Open comparable
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {citations.length > 0 ? (
        <section className="panel stack gap-sm">
          <h2>Citations</h2>
          <ul className="plain-list">
            {citations.map((citation: Record<string, any>) => (
              <li key={citation.url}>
                <a className="source-link" href={citation.url} rel="noreferrer" target="_blank">
                  {citation.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {images.length > 1 ? (
        <section className="stack gap-md">
          <h2>Full gallery</h2>
          <div className="image-grid">
            {images.map((image: Record<string, any>) => (
              <div className="gallery-frame" key={image.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={image.alt_text ?? listing?.title ?? "Listing image"} src={image.image_url} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
