import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer } from "@/lib/server/auth";
import { importListingForViewer } from "@/lib/server/data";
import { ensureErrorMessage } from "@/lib/utils";

const importSchema = z.object({
  url: z.string().url()
});

export async function POST(request: Request) {
  if (!hasSupabaseBrowserConfig()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const body = importSchema.parse(await request.json());
    const viewer = await getOptionalViewer();

    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = await importListingForViewer(viewer.id, body.url);

    return NextResponse.json({ id }, { status: 202 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: ensureErrorMessage(error) }, { status });
  }
}
