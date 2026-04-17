import Link from "next/link";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { requireViewer } from "@/lib/server/auth";
import { getDashboardData, syncUserProfileMetadata } from "@/lib/server/data";
import { compactNumber } from "@/lib/utils";
import { ListingCard } from "@/components/dashboard/listing-card";
import { ImportForm } from "@/components/dashboard/import-form";

export default async function DashboardPage() {
  if (!hasSupabaseBrowserConfig()) {
    return (
      <section className="panel stack gap-sm">
        <h1>Configure Supabase first</h1>
        <p className="muted">
          The dashboard depends on Supabase Auth, Postgres, and queues. Copy `.env.example` and add
          your project keys before using the app.
        </p>
      </section>
    );
  }

  const viewer = await requireViewer();
  await syncUserProfileMetadata();
  const data = await getDashboardData(viewer.id);

  return (
    <div className="stack gap-lg">
      <section className="dashboard-hero">
        <div className="stack gap-sm">
          <span className="eyebrow">Workspace</span>
          <h1>Listings, quotas, and worker-ready imports.</h1>
          <p className="lead">
            Start from a direct listing URL. The worker queues scraping and analysis automatically,
            while tracked refreshes stay within per-user limits.
          </p>
        </div>

        <div className="metric-grid panel">
          <div>
            <strong>{data.importsUsedToday}/{data.importLimit}</strong>
            <span>Imports used today</span>
          </div>
          <div>
            <strong>{data.trackedCount}/{data.trackedLimit}</strong>
            <span>Active tracked listings</span>
          </div>
          <div>
            <strong>{compactNumber(data.listings.length)}</strong>
            <span>Visible listing records</span>
          </div>
          <div>
            <strong>{data.refreshCooldownHours}h</strong>
            <span>Manual refresh cooldown</span>
          </div>
        </div>
      </section>

      <section className="grid-two">
        <ImportForm />

        <article className="panel stack gap-sm">
          <h2>What to expect after submit</h2>
          <ol className="steps">
            <li>A crawl target is created and linked to your account.</li>
            <li>The worker reads `import_url`, then queues `refresh_listing`.</li>
            <li>Normalized data, seller details, images, and comparables are persisted.</li>
            <li>OpenRouter produces a strict report schema for the listing detail page.</li>
          </ol>
          <Link className="button button--ghost" href="/admin">
            Open source health
          </Link>
        </article>
      </section>

      <section className="stack gap-md">
        <div className="row space-between baseline wrap">
          <div>
            <span className="eyebrow">Tracked inventory</span>
            <h2>Your listings</h2>
          </div>
          <p className="muted">{data.listings.length} records visible in your workspace</p>
        </div>

        {data.listings.length === 0 ? (
          <article className="panel stack gap-sm">
            <h3>No listings yet</h3>
            <p className="muted">
              Paste your first eBay or Kleinanzeigen URL above to create the crawl target and queue
              the worker pipeline.
            </p>
          </article>
        ) : (
          <div className="listing-grid">
            {data.listings.map((card) => (
              <ListingCard card={card} key={card.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
