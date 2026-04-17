import { NextResponse } from "next/server";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer } from "@/lib/server/auth";
import { getListingDetail } from "@/lib/server/data";
import { ensureErrorMessage } from "@/lib/utils";

interface ListingRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_: Request, { params }: ListingRouteProps) {
  if (!hasSupabaseBrowserConfig()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const viewer = await getOptionalViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const detail = await getListingDetail(viewer.id, id);

    if (!detail.trackedListing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json({ error: ensureErrorMessage(error) }, { status: 500 });
  }
}
