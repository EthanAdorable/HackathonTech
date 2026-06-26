import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";

export async function GET() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ source: "local", users: [] });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const users = await client.query(api.users.list, {});
    return NextResponse.json({ source: "convex", users });
  } catch {
    return NextResponse.json({ source: "local", users: [] });
  }
}
