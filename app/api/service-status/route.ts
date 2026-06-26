import { NextResponse } from "next/server";

export async function GET() {
  const convexProject = process.env.TAMS_CONVEX_PROJECT || "tams-hub-prototype";
  const railwayProject = process.env.TAMS_RAILWAY_PROJECT || "tams-hub-prototype";
  const railwayProjectId = process.env.TAMS_RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_ID || "";
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";
  const convexHost = hostForUrl(convexUrl);

  return NextResponse.json({
    convexConfigured: Boolean(convexUrl),
    convexHost,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    railwayConfigured: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT,
    convexProject,
    railwayProject,
    railwayProjectId: railwayProjectId ? "set" : "missing",
    railwayProjectIdConfigured: Boolean(railwayProjectId),
  });
}

function hostForUrl(value: string) {
  try {
    return value ? new URL(value).host : "";
  } catch {
    return "";
  }
}
