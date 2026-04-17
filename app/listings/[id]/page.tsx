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

  return (
    <div className="stack gap-lg">
      <section className="grid-two listing-detail-grid">
        <div className="stack gap-md">
          <div className="row gap-xs wrap">
            <StatusPill label={detail.target?.marketplace?.toUpperCase?.() ?? "QUEUED"} />
            <StatusPill intent="neutral" label={detail.trackedListing?.tracking_state ?? "observed"} />
            {report?.priceVerdict ? (
              <StatusPill
                intent={
                  report.priceVerdict === "fair"
                    ? "warning"
                    : report.priceVerdict === "good_deal" || report.priceVerdict === "very_good_deal"
                      ? "success"
                      : "danger"
                }
                label={report.priceVerdict}
              />
            ) : null}
          </div>

          <div className="stack gap-sm">
            <h1>{listing?.title ?? "Listing queued for processing"}</h1>
            <p className="lead">{detail.target?.source_url}</p>
            <div className="row gap-md wrap">
              <strong>{formatCurrency(listing?.price_amount, listing?.currency ?? "EUR")}</strong>
              <span className="muted">{listing?.availability ?? detail.target?.status ?? "queued"}</span>
              <span className="muted">Last crawl {formatDate(detail.target?.last_crawled_at)}</span>
            </div>
          </div>

          <ListingActions listingId={id} trackingState={detail.trackedListing?.tracking_state} />
        </div>

        <aside className="panel stack gap-sm">
          <h2>Seller signals</h2>
          {detail.seller ? (
            <>
              <p><strong>{detail.seller.name}</strong></p>
              <p className="muted">{detail.seller.location_text ?? "No location available"}</p>
              <p className="muted">
                Rating {detail.seller.rating_score ?? "?"} from {detail.seller.rating_count ?? 0} reviews
              </p>
              <p className="muted">Member since {detail.seller.member_since_text ?? "unknown"}</p>
            </>
          ) : (
            <p className="muted">Seller details will appear after the first successful normalization.</p>
          )}
        </aside>
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

      <section className="stack gap-md">
        <h2>Images and raw details</h2>
        <div className="image-grid">
          {images.length > 0 ? (
            images.map((image: Record<string, any>) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={image.alt_text ?? listing?.title ?? "Listing image"} key={image.id} src={image.image_url} />
            ))
          ) : (
            <article className="panel stack gap-sm">
              <p className="muted">No images normalized yet.</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
