import { NextResponse } from "next/server";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer } from "@/lib/server/auth";
import { regenerateAnalysisForViewer } from "@/lib/server/data";
import { ensureErrorMessage } from "@/lib/utils";

interface AnalyzeRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_: Request, { params }: AnalyzeRouteProps) {
  if (!hasSupabaseBrowserConfig()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const viewer = await getOptionalViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await regenerateAnalysisForViewer(viewer.id, id);

    return NextResponse.json(
      {
        generationMode: result.analysis.report.generationMode,
        modelSlug: result.analysis.report.modelSlug,
        ok: true,
        reportId: result.report.id
      },
      { status: 201 }
    );
  } catch (error) {
    const message = ensureErrorMessage(error);
    const status = message === "Listing not found" ? 404 : message === "Unauthorized" ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
