import Link from "next/link";

import { DashboardCard } from "@/lib/server/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/common/status-pill";

interface ListingCardProps {
  card: DashboardCard;
}

function verdictIntent(verdict: string | null) {
  switch (verdict) {
    case "very_good_deal":
    case "good_deal":
      return "success";
    case "overpriced":
    case "high_risk":
      return "danger";
    case "fair":
      return "warning";
    default:
      return "neutral";
  }
}

export function ListingCard({ card }: ListingCardProps) {
  return (
    <article className="listing-card">
      <div className="listing-card__media">
        {card.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={card.title} src={card.primaryImageUrl} />
        ) : (
          <div className="listing-card__placeholder">{card.marketplace}</div>
        )}
      </div>

      <div className="stack gap-sm">
        <div className="stack gap-xs">
          <div className="row gap-xs wrap">
            <StatusPill label={card.marketplace.toUpperCase()} />
            <StatusPill intent="neutral" label={card.trackingState} />
            {card.latestVerdict ? (
              <StatusPill intent={verdictIntent(card.latestVerdict)} label={card.latestVerdict} />
            ) : null}
          </div>

          <h3>{card.title}</h3>
          <p className="muted clamp-2">{card.sourceUrl}</p>
        </div>

        <div className="row space-between baseline">
          <strong>{formatCurrency(card.priceAmount)}</strong>
          <span className="muted">{card.availability ?? "Queued"}</span>
        </div>

        <div className="row space-between baseline">
          <span className="muted">Updated {formatDate(card.updatedAt)}</span>
          <Link className="button button--ghost" href={`/listings/${card.id}`}>
            Open
          </Link>
        </div>
      </div>
    </article>
  );
}
