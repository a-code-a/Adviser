import { NextResponse } from "next/server";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer } from "@/lib/server/auth";
import { requestRefreshForViewer } from "@/lib/server/data";
import { ensureErrorMessage } from "@/lib/utils";

interface RefreshRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_: Request, { params }: RefreshRouteProps) {
  if (!hasSupabaseBrowserConfig()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const viewer = await getOptionalViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await requestRefreshForViewer(id);

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    const message = ensureErrorMessage(error);
    const status =
      message === "Refresh cooldown is still active"
        ? 429
        : message === "Listing not found"
          ? 404
          : message === "Unauthorized"
            ? 401
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
