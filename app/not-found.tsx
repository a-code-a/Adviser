import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel stack gap-sm">
      <h1>Listing not found</h1>
      <p className="muted">
        The listing either does not exist in your workspace yet or the worker has not created it.
      </p>
      <Link className="button button--primary" href="/dashboard">
        Return to dashboard
      </Link>
    </section>
  );
}
