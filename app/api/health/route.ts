import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "tams-hub-prototype",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
    services: {
      convex: Boolean(process.env.NEXT_PUBLIC_CONVEX_URL),
      openai: Boolean(process.env.OPENAI_API_KEY),
      railway: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
    },
  });
}
