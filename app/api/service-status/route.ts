import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    convexConfigured: Boolean(process.env.NEXT_PUBLIC_CONVEX_URL),
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    railwayConfigured: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT,
  });
}
