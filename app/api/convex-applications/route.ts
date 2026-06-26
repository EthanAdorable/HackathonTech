import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";

export async function GET() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ source: "local", applications: [] });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const applications = await client.query(api.applications.listWithDetails, {});

    return NextResponse.json({ source: "convex", applications });
  } catch {
    return NextResponse.json({ source: "local", applications: [] });
  }
}
