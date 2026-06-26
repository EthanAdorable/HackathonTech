import { NextResponse } from "next/server";

export async function GET() {
  const convexProject = process.env.TAMS_CONVEX_PROJECT || "tams-hub-prototype";
  const railwayProject = process.env.TAMS_RAILWAY_PROJECT || "TAMS Hub";
  const railwayProjectId = process.env.TAMS_RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_ID || "";
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";
  const convexHost = hostForUrl(convexUrl);
  const nextAuthSecret = process.env.NEXTAUTH_SECRET || "";
  const nextAuthUrl = process.env.NEXTAUTH_URL || "";
  const demoAuthEnabled = process.env.TAMS_DEMO_AUTH_ENABLED === "true";
  const authWarnings = [
    isPrototypeSecret(nextAuthSecret) ? "prototype secret" : "",
    isLoopbackUrl(nextAuthUrl) ? "localhost callback" : "",
    demoAuthEnabled ? "demo role switching" : "",
  ].filter(Boolean);

  return NextResponse.json({
    authReadyForDeploy: authWarnings.length === 0,
    authWarnings,
    demoAuthEnabled,
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

function isPrototypeSecret(value: string) {
  return value === "replace-with-a-local-secret" || value === "local-tams-hub-prototype-secret";
}

function isLoopbackUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function hostForUrl(value: string) {
  try {
    return value ? new URL(value).host : "";
  } catch {
    return "";
  }
}
