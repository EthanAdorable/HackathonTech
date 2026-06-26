import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAccessActor } from "@/lib/server-access";
import { withTimeout } from "@/lib/async-timeout";

export async function GET(request: Request) {
  const actor = await getAccessActor();
  if (!actor) {
    return NextResponse.json({ source: "convex", logs: [], error: "Authentication required." }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!convexUrl || !applicationId || applicationId.startsWith("app-")) {
    return NextResponse.json({ source: "local", logs: [] });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const logs = await withTimeout(
      client.query(api.guide.listForApplication, {
        actor,
        applicationId: applicationId as Id<"applications">,
      }),
    );
    return NextResponse.json({ source: "convex", logs });
  } catch {
    return NextResponse.json({ source: "local", logs: [] });
  }
}
