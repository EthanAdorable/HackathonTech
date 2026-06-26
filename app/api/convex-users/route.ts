import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAccessActor } from "@/lib/server-access";
import { withTimeout } from "@/lib/async-timeout";

export async function GET() {
  const actor = await getAccessActor();
  if (!actor) {
    return NextResponse.json({ source: "convex", users: [], error: "Authentication required." }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ source: "local", users: [] });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const users = await withTimeout(client.query(api.users.list, { actor }));
    return NextResponse.json({ source: "convex", users });
  } catch {
    return NextResponse.json({ source: "local", users: [] });
  }
}
