import { hasSupabaseBrowserConfig, readEnvironment } from "@/lib/env";
import { isViewerAdmin, requireViewer } from "@/lib/server/auth";
import { getAdminOverview } from "@/lib/server/data";
import { formatDate } from "@/lib/utils";
import { AdminSeedForm } from "@/components/admin/seed-form";
import { StatusPill } from "@/components/common/status-pill";

export default async function AdminPage() {
  if (!hasSupabaseBrowserConfig()) {
    return (
      <section className="panel stack gap-sm">
        <h1>Supabase is not configured</h1>
        <p className="muted">Admin health views depend on database-backed queue metrics.</p>
      </section>
    );
  }

  if (!readEnvironment().SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <section className="panel stack gap-sm">
        <h1>Service role key required</h1>
        <p className="muted">
          The admin page reads queue metrics and source controls through a server-side Supabase
          client. Add `SUPABASE_SERVICE_ROLE_KEY` before opening this view.
        </p>
      </section>
    );
  }

  const viewer = await requireViewer();

  if (!isViewerAdmin(viewer)) {
    return (
      <section className="panel stack gap-sm">
        <h1>Admin access required</h1>
        <p className="muted">
          Promote the user profile to `admin` in the database or add the email to `ADMIN_EMAILS`.
        </p>
      </section>
    );
  }

  const overview = await getAdminOverview();

  return (
    <div className="stack gap-lg">
      <section className="dashboard-hero">
        <div className="stack gap-sm">
          <span className="eyebrow">Operations</span>
          <h1>Source health, queue pressure, and crawl blocks.</h1>
          <p className="lead">
            This page is for manual control of marketplace adapters, queue visibility, and recent
            signs of source-side blocking.
          </p>
        </div>
      </section>

      <section className="grid-two">
        <AdminSeedForm />

        <article className="panel stack gap-sm">
          <h2>Queue metrics</h2>
          <div className="stack gap-sm">
            {overview.queues.map((queue) => (
              <div className="metric-row" key={queue.queue_name}>
                <div>
                  <strong>{queue.queue_name}</strong>
                  <p className="muted">Total {queue.total_messages}</p>
                </div>
                <div className="row gap-sm wrap">
                  <StatusPill label={`${queue.queue_length} pending`} />
                  <StatusPill intent="warning" label={`${queue.oldest_msg_age_sec ?? 0}s oldest`} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel stack gap-sm">
          <h2>Source controls</h2>
          <div className="stack gap-sm">
            {overview.sourceControls.map((source) => (
              <div className="metric-row" key={source.marketplace}>
                <div>
                  <strong>{source.marketplace}</strong>
                  <p className="muted">
                    {source.max_concurrency} concurrent, {source.requests_per_minute}/min, backoff{" "}
                    {source.retry_backoff_seconds}s
                  </p>
                </div>
                <div className="row gap-sm wrap">
                  <StatusPill intent={source.enabled ? "success" : "danger"} label={source.enabled ? "enabled" : "disabled"} />
                  <StatusPill
                    intent={source.seed_enabled ? "warning" : "neutral"}
                    label={source.seed_enabled ? "seed on" : "seed off"}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel stack gap-sm">
        <h2>Recent block events</h2>
        {overview.recentBlocks.length === 0 ? (
          <p className="muted">No recent block or CAPTCHA detections.</p>
        ) : (
          <div className="stack gap-sm">
            {overview.recentBlocks.map((block) => (
              <div className="metric-row" key={block.id}>
                <div>
                  <strong>{block.marketplace}</strong>
                  <p className="muted">{block.reason}</p>
                  <p className="muted">{block.source_url}</p>
                </div>
                <span className="muted">{formatDate(block.detected_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
