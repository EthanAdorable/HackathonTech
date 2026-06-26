import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import OpenAI from "openai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { canReadApplication, type AccessActor } from "@/lib/access-policy";
import { getAccessActor } from "@/lib/server-access";
import { withTimeout } from "@/lib/async-timeout";
import { codexLbReasoningEffort, defaultCodexLbBaseUrl, defaultCodexLbModel } from "@/lib/codex-lb";
import {
  type EventApplication,
  getApplicationCompletion,
  makeAiSummary,
  makeChecklist,
  makeRevisionDraft,
  seedApplications,
} from "@/lib/tams-data";
import { makePolicyClarificationDraft, saduGuidePolicy } from "@/lib/sadu-guide-policy";

type GuideMode = "checklist" | "missing" | "summary" | "revision" | "question";

type GuideRequest = {
  mode: GuideMode;
  question?: string;
  applicationId: string;
};

type AuthorizedGuideRequest = GuideRequest & {
  application: EventApplication;
  dataSource: "convex" | "local-demo";
};

export async function POST(request: Request) {
  const actor = await getAccessActor();
  if (!actor) {
    return NextResponse.json({ source: "access-denied", lines: [], error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as GuideRequest;
  const authorizedBody = await withAuthorizedApplication(body, actor);
  if (!authorizedBody) {
    return NextResponse.json({ source: "access-denied", lines: [], error: "Application access denied." }, { status: 403 });
  }

  const mockLines = getMockLines(authorizedBody);
  const codexLbApiKey = process.env.CODEX_LB_API_KEY;

  if (!codexLbApiKey) {
    const source = authorizedBody.dataSource === "local-demo" ? "local-demo" : "mock-no-key";
    await recordGuideLog(authorizedBody, actor, source, mockLines);
    return NextResponse.json({ source, lines: mockLines, dataSource: authorizedBody.dataSource });
  }

  try {
    const client = new OpenAI({
      apiKey: codexLbApiKey,
      baseURL: normalizeBaseUrl(process.env.CODEX_LB_BASE_URL || defaultCodexLbBaseUrl),
    });
    const completion = await withTimeout(
      client.chat.completions.create({
        model: process.env.CODEX_LB_MODEL ?? defaultCodexLbModel,
        reasoning_effort: codexLbReasoningEffort(),
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You are TAMS Guide for a campus event filing assistant. Use ${saduGuidePolicy.sourceLabel} as the structured guidance source. Provide concise operational guidance only. Always state that final approval belongs to SADU human reviewers. Do not invent formal compliance policy.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              mode: authorizedBody.mode,
              question: authorizedBody.question,
              policySource: saduGuidePolicy.sourceLabel,
              application: {
                title: authorizedBody.application.title,
                organization: authorizedBody.application.organization,
                eventType: authorizedBody.application.eventType,
                venue: authorizedBody.application.venue,
                eventDate: authorizedBody.application.eventDate,
                expectedParticipants: authorizedBody.application.expectedParticipants,
                status: authorizedBody.application.status,
                completion: getApplicationCompletion(authorizedBody.application),
              },
            }),
          },
        ],
      }),
      Number(process.env.CODEX_LB_TIMEOUT_MS ?? 8000),
    );

    const text = completion.choices[0]?.message.content;
    const lines = text
      ? text.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean).slice(0, 6)
      : mockLines;

    await recordGuideLog(authorizedBody, actor, "codex-lb", lines);
    return NextResponse.json({ source: "codex-lb", lines, dataSource: authorizedBody.dataSource });
  } catch (error) {
    console.warn(
      "TAMS Guide codex-lb request failed; using mock fallback.",
      error instanceof Error ? error.message : String(error),
    );
    const source = error instanceof Error && /timed out/i.test(error.message) ? "mock-codex-lb-timeout" : "mock-codex-lb-error";
    await recordGuideLog(authorizedBody, actor, source, mockLines);
    return NextResponse.json({
      source,
      lines: mockLines,
      dataSource: authorizedBody.dataSource,
      error: error instanceof Error ? error.message : "Codex-LB request failed.",
    });
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

async function withAuthorizedApplication(request: GuideRequest, actor: AccessActor) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const applicationId = request.applicationId;
  if (!applicationId || applicationId.startsWith("app-")) {
    const application = seedApplications.find((item) => item.id === applicationId);
    return application && canReadApplication(actor, application)
      ? { ...request, application, dataSource: "local-demo" as const }
      : null;
  }
  if (!convexUrl) return null;

  try {
    const client = new ConvexHttpClient(convexUrl);
    const application = await withTimeout(
      client.query(api.applications.get, {
        applicationId: applicationId as Id<"applications">,
        actor,
      }),
    );
    return application ? { ...request, application, dataSource: "convex" as const } : null;
  } catch {
    return null;
  }
}

async function recordGuideLog(request: AuthorizedGuideRequest, actor: AccessActor, source: string, lines: string[]) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const applicationId = request.applicationId;
  if (!convexUrl || !applicationId || applicationId.startsWith("app-")) return;

  try {
    const client = new ConvexHttpClient(convexUrl);
    await withTimeout(
      client.mutation(api.guide.record, {
        actor,
        applicationId: applicationId as Id<"applications">,
        mode: request.mode,
        question: request.question,
        source,
        lines,
      }),
    );
  } catch {
    // Guidance should still be returned even if audit logging is unavailable.
  }
}

function getMockLines({ mode, question, application }: AuthorizedGuideRequest) {
  if (mode === "checklist") return makeChecklist(application);
  if (mode === "missing") {
    const missing = getApplicationCompletion(application).missing;
    return missing.length ? missing : ["All required prototype fields are complete."];
  }
  if (mode === "revision") return [makeRevisionDraft(application)];
  if (mode === "question") {
    return makePolicyClarificationDraft(application, question);
  }
  return [makeAiSummary(application)];
}
