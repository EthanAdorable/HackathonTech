import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EventStatus } from "@/lib/tams-data";

type WorkflowRequest = {
  action:
    | "create"
    | "updateTemplate"
    | "updateTemplateAvailability"
    | "addMessage"
    | "updateStatus"
    | "requestRevision"
    | "resubmit"
    | "approve"
    | "reject"
    | "addEndorsement";
  applicationId?: string;
  templateDocumentId?: string;
  templateId?: string;
  enabled?: boolean;
  title?: string;
  organization?: string;
  eventType?: string;
  venue?: string;
  eventDate?: string;
  expectedParticipants?: number;
  ownerId?: string;
  adviserId?: string;
  riskLevel?: "Low" | "Medium" | "High";
  templates?: { templateId: string; enabled: boolean; values: Record<string, string> }[];
  values?: Record<string, string>;
  author?: string;
  role?: string;
  body?: string;
  status?: string;
  note?: string;
};

async function listApplications(client: ConvexHttpClient) {
  return await client.query(api.applications.listWithDetails, {});
}

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ source: "local", applications: [] });
  }

  try {
    const payload = (await request.json()) as WorkflowRequest;
    const client = new ConvexHttpClient(convexUrl);
    let createdApplicationId: Id<"applications"> | undefined;
    const applicationId = payload.applicationId as Id<"applications"> | undefined;

    if (payload.action === "create") {
      createdApplicationId = await client.mutation(api.applications.create, {
        title: payload.title ?? "New Campus Event",
        organization: payload.organization ?? "Junior Philippine Computer Society",
        eventType: payload.eventType ?? "Workshop",
        venue: payload.venue ?? "FEU Alabang Auditorium",
        eventDate: payload.eventDate ?? new Date().toISOString().slice(0, 10),
        expectedParticipants: payload.expectedParticipants ?? 40,
        ownerId: payload.ownerId ?? "juan",
        adviserId: payload.adviserId ?? "adviser",
        riskLevel: payload.riskLevel ?? "Low",
        templates: payload.templates ?? [],
      });
    } else if (payload.action === "updateTemplate") {
      await client.mutation(api.applications.updateTemplate, {
        templateDocumentId: payload.templateDocumentId as Id<"templates">,
        values: payload.values ?? {},
      });
    } else if (payload.action === "updateTemplateAvailability") {
      await client.mutation(api.applications.updateTemplateAvailability, {
        templateId: payload.templateId ?? "",
        enabled: payload.enabled ?? true,
      });
    } else if (payload.action === "addMessage" && applicationId) {
      await client.mutation(api.applications.addMessage, {
        applicationId,
        author: payload.author ?? "TAMS Hub",
        role: payload.role ?? "Student Officer",
        body: payload.body ?? "",
      });
    } else if (payload.action === "updateStatus" && applicationId) {
      await client.mutation(api.applications.updateStatus, {
        applicationId,
        status: payload.status as EventStatus,
        note: payload.note ?? "Status updated in TAMS Hub.",
      });
    } else if (payload.action === "requestRevision" && applicationId) {
      await client.mutation(api.applications.requestRevision, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body ?? "",
      });
    } else if (payload.action === "resubmit" && applicationId) {
      await client.mutation(api.applications.resubmit, {
        applicationId,
        note: payload.note,
      });
    } else if (payload.action === "approve" && applicationId) {
      await client.mutation(api.applications.approve, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body,
      });
    } else if (payload.action === "reject" && applicationId) {
      await client.mutation(api.applications.reject, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body,
      });
    } else if (payload.action === "addEndorsement" && applicationId) {
      await client.mutation(api.applications.addEndorsement, {
        applicationId,
        author: payload.author ?? "Faculty Adviser",
        body: payload.body,
      });
    }

    return NextResponse.json({ source: "convex", applications: await listApplications(client), createdApplicationId });
  } catch {
    return NextResponse.json({ source: "local", applications: [] });
  }
}
