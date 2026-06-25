import { NextResponse } from "next/server";
import OpenAI from "openai";
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

    return NextResponse.json({ source: "openai", lines });
  } catch {
    return NextResponse.json({ source: "mock-fallback", lines: mockLines });
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
