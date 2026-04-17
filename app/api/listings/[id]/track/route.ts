import { NextResponse } from "next/server";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer } from "@/lib/server/auth";
import { enableTrackingForViewer } from "@/lib/server/data";
import { ensureErrorMessage } from "@/lib/utils";

interface TrackRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_: Request, { params }: TrackRouteProps) {
  if (!hasSupabaseBrowserConfig()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const viewer = await getOptionalViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await enableTrackingForViewer(id);

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: ensureErrorMessage(error) }, { status: 500 });
  }
}
