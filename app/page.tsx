import Link from "next/link";

export default function HomePage() {
  return (
    <div className="stack gap-lg">
      <section className="hero">
        <div className="hero__copy stack gap-md">
          <span className="eyebrow">Germany-first marketplace intelligence</span>
          <h1>Scrape a listing, score the risk, and compare the market before you buy.</h1>
          <p className="lead">
            Marketplace Advisor ingests eBay and Kleinanzeigen listings, stores the raw scrape,
            enriches the data with seller signals, and runs OpenRouter-backed buying analysis with
            live comparison search.
          </p>
          <div className="row gap-sm wrap">
            <Link className="button button--primary" href="/dashboard">
              Open dashboard
            </Link>
            <Link className="button button--ghost" href="/login">
              Email magic link
            </Link>
          </div>
        </div>

        <div className="hero__panel panel stack gap-sm">
          <div className="metric-grid">
            <div>
              <strong>4-stage queue</strong>
              <span>import → seed → refresh → analyze</span>
            </div>
            <div>
              <strong>Structured reports</strong>
              <span>price verdict, fair range, seller assessment</span>
            </div>
            <div>
              <strong>Source controls</strong>
              <span>per-market concurrency, retry backoff, kill switches</span>
            </div>
            <div>
              <strong>Tracked refreshes</strong>
              <span>quota-safe monitoring for price and availability changes</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid-two">
        <article className="panel stack gap-sm">
          <span className="eyebrow">Flow</span>
          <h2>How the first release works</h2>
          <p className="muted">
            Users paste a listing URL. The app creates a crawl target, queues work in Supabase,
            stores raw snapshots, normalizes the listing, calculates internal comparables, and asks
            an OpenRouter model to produce a strict JSON report.
          </p>
        </article>

        <article className="panel stack gap-sm">
          <span className="eyebrow">Safety</span>
          <h2>Designed for throttling and source health</h2>
          <p className="muted">
            Every source can be switched off independently. CAPTCHA or block patterns land in
            `crawl_blocks`, retries go through backoff, and dead letters preserve failed jobs for
            inspection.
          </p>
        </article>
      </section>

      <section className="feature-strip">
        <article className="feature-card">
          <h3>Raw capture preserved</h3>
          <p>
            HTML and API payloads are stored on every run so parser improvements do not require a
            second fetch.
          </p>
        </article>

        <article className="feature-card">
          <h3>Seller signal scoring</h3>
          <p>
            Ratings, account age, badges, and incomplete disclosure all feed into risk and question
            generation.
          </p>
        </article>

        <article className="feature-card">
          <h3>Hybrid price comparison</h3>
          <p>
            Internal corpus matches come first. Live search only supplements freshness and coverage.
          </p>
        </article>
      </section>
    </div>
  );
}
