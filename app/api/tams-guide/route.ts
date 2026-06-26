import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import OpenAI from "openai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type EventApplication,
  getApplicationCompletion,
  makeAiSummary,
  makeChecklist,
  makeRevisionDraft,
} from "@/lib/tams-data";

type GuideMode = "checklist" | "missing" | "summary" | "revision" | "question";

type GuideRequest = {
  mode: GuideMode;
  question?: string;
  application: EventApplication;
};

export async function POST(request: Request) {
  const body = (await request.json()) as GuideRequest;
  const mockLines = getMockLines(body);

  if (!process.env.OPENAI_API_KEY) {
    await recordGuideLog(body, "mock", mockLines);
    return NextResponse.json({ source: "mock", lines: mockLines });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are TAMS Guide for a campus event filing prototype. Provide concise operational guidance only. Always state that final approval belongs to SADU human reviewers. Do not invent formal compliance policy.",
        },
        {
          role: "user",
          content: JSON.stringify({
            mode: body.mode,
            question: body.question,
            application: {
              title: body.application.title,
              organization: body.application.organization,
              eventType: body.application.eventType,
              venue: body.application.venue,
              eventDate: body.application.eventDate,
              expectedParticipants: body.application.expectedParticipants,
              status: body.application.status,
              completion: getApplicationCompletion(body.application),
            },
          }),
        },
      ],
    });

    const text = completion.choices[0]?.message.content;
    const lines = text
      ? text.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean).slice(0, 6)
      : mockLines;

    await recordGuideLog(body, "openai", lines);
    return NextResponse.json({ source: "openai", lines });
  } catch {
    await recordGuideLog(body, "mock-fallback", mockLines);
    return NextResponse.json({ source: "mock-fallback", lines: mockLines });
  }
}

async function recordGuideLog(request: GuideRequest, source: string, lines: string[]) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const applicationId = request.application.id;
  if (!convexUrl || !applicationId || applicationId.startsWith("app-")) return;

  try {
    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(api.guide.record, {
      applicationId: applicationId as Id<"applications">,
      mode: request.mode,
      question: request.question,
      source,
      lines,
    });
  } catch {
    // Guidance should still be returned even if audit logging is unavailable.
  }
}

function getMockLines({ mode, question, application }: GuideRequest) {
  if (mode === "checklist") return makeChecklist(application);
  if (mode === "missing") {
    const missing = getApplicationCompletion(application).missing;
    return missing.length ? missing : ["All required prototype fields are complete."];
  }
  if (mode === "revision") return [makeRevisionDraft(application)];
  if (mode === "question") {
    return [
      `Question: ${question ?? "What should be completed before SADU review?"}`,
      "Complete required templates, run the pre-check, keep adviser and SADU comments in the message thread, and wait for SADU's human decision.",
      "This is guidance only, not an approval.",
    ];
  }
  return [makeAiSummary(application)];
}
