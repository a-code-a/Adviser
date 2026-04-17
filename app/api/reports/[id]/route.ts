import { NextResponse } from "next/server";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer } from "@/lib/server/auth";
import { getReport } from "@/lib/server/data";
import { ensureErrorMessage } from "@/lib/utils";

interface ReportRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_: Request, { params }: ReportRouteProps) {
  if (!hasSupabaseBrowserConfig()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const viewer = await getOptionalViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const report = await getReport(viewer.id, id);

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: ensureErrorMessage(error) }, { status: 500 });
  }
}
