import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseBrowserConfig } from "@/lib/env";
import { getOptionalViewer, isViewerAdmin } from "@/lib/server/auth";
import { enqueueSeedForAdmin } from "@/lib/server/data";
import { ensureErrorMessage } from "@/lib/utils";

const adminSeedSchema = z.object({
  category: z.string().trim().nullish(),
  marketplace: z.enum(["ebay", "kleinanzeigen"]),
  query: z.string().trim().min(1)
});

export async function POST(request: Request) {
  if (!hasSupabaseBrowserConfig()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const viewer = await getOptionalViewer();

    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isViewerAdmin(viewer)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = adminSeedSchema.parse(await request.json());
    await enqueueSeedForAdmin(body);

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: ensureErrorMessage(error) }, { status });
  }
}
