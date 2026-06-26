import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!convexUrl || !applicationId || applicationId.startsWith("app-")) {
    return NextResponse.json({ source: "local", logs: [] });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const logs = await client.query(api.guide.listForApplication, {
      applicationId: applicationId as Id<"applications">,
    });
    return NextResponse.json({ source: "convex", logs });
  } catch {
    return NextResponse.json({ source: "local", logs: [] });
  }
}
