import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { withTimeout } from "@/lib/async-timeout";
import type { EventStatus } from "@/lib/tams-data";

type WorkflowRequest = {
  action:
    | "create"
    | "resetDemo"
    | "updateDetails"
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
  return await withTimeout(client.query(api.applications.listWithDetails, {}));
}

async function getApplication(client: ConvexHttpClient, applicationId: Id<"applications">) {
  const application = await withTimeout(client.query(api.applications.get, { applicationId }));
  if (!application) throw new Error("Application not found.");
  return application;
}

function assertStatus(currentStatus: string, allowed: string[], action: string) {
  if (!allowed.includes(currentStatus)) {
    throw new Error(`${action} is not allowed from ${currentStatus}.`);
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as WorkflowRequest;
  if (!payload.action) {
    return NextResponse.json({ source: "local", applications: [], error: "Workflow action is required." }, { status: 400 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ source: "local", applications: [] });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    let createdApplicationId: Id<"applications"> | undefined;
    const applicationId = payload.applicationId as Id<"applications"> | undefined;
    const application = applicationId ? await getApplication(client, applicationId) : null;

    if (payload.action === "resetDemo") {
      await withTimeout(client.mutation(api.seed.seedDemoData, {}));
    } else if (payload.action === "create") {
      createdApplicationId = await withTimeout(client.mutation(api.applications.create, {
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
      }));
    } else if (payload.action === "updateTemplate") {
      await withTimeout(client.mutation(api.applications.updateTemplate, {
        templateDocumentId: payload.templateDocumentId as Id<"templates">,
        values: payload.values ?? {},
      }));
    } else if (payload.action === "updateDetails" && applicationId) {
      assertStatus(application!.status, ["Draft", "Template Completion", "AI Pre-check", "Revision Requested"], "Event detail editing");
      await withTimeout(client.mutation(api.applications.updateDetails, {
        applicationId,
        title: payload.title ?? "New Campus Event",
        organization: payload.organization ?? "Junior Philippine Computer Society",
        eventType: payload.eventType ?? "Workshop",
        venue: payload.venue ?? "FEU Alabang Auditorium",
        eventDate: payload.eventDate ?? new Date().toISOString().slice(0, 10),
        expectedParticipants: payload.expectedParticipants ?? 40,
      }));
    } else if (payload.action === "updateTemplateAvailability") {
      await withTimeout(client.mutation(api.applications.updateTemplateAvailability, {
        templateId: payload.templateId ?? "",
        enabled: payload.enabled ?? true,
      }));
    } else if (payload.action === "addMessage" && applicationId) {
      await withTimeout(client.mutation(api.applications.addMessage, {
        applicationId,
        author: payload.author ?? "TAMS Hub",
        role: payload.role ?? "Student Officer",
        body: payload.body ?? "",
      }));
    } else if (payload.action === "updateStatus" && applicationId) {
      if (payload.status === "AI Pre-check") {
        assertStatus(application!.status, ["Draft", "Template Completion", "AI Pre-check"], "Pre-check");
      } else if (payload.status === "Submitted to SADU") {
        assertStatus(application!.status, ["Template Completion", "AI Pre-check"], "Submission");
      } else if (payload.status === "Under Review") {
        assertStatus(application!.status, ["Submitted to SADU", "Resubmitted"], "SADU review");
      } else {
        throw new Error(`Use the ${payload.status ?? "requested"} workflow action.`);
      }
      await withTimeout(client.mutation(api.applications.updateStatus, {
        applicationId,
        status: payload.status as EventStatus,
        note: payload.note ?? "Status updated in TAMS Hub.",
      }));
    } else if (payload.action === "requestRevision" && applicationId) {
      assertStatus(application!.status, ["Under Review"], "Revision request");
      await withTimeout(client.mutation(api.applications.requestRevision, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body ?? "",
      }));
    } else if (payload.action === "resubmit" && applicationId) {
      assertStatus(application!.status, ["Revision Requested"], "Resubmission");
      await withTimeout(client.mutation(api.applications.resubmit, {
        applicationId,
        note: payload.note,
      }));
    } else if (payload.action === "approve" && applicationId) {
      assertStatus(application!.status, ["Under Review"], "Approval");
      await withTimeout(client.mutation(api.applications.approve, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body,
      }));
    } else if (payload.action === "reject" && applicationId) {
      assertStatus(application!.status, ["Under Review"], "Rejection");
      await withTimeout(client.mutation(api.applications.reject, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body,
      }));
    } else if (payload.action === "addEndorsement" && applicationId) {
      await withTimeout(client.mutation(api.applications.addEndorsement, {
        applicationId,
        author: payload.author ?? "Faculty Adviser",
        body: payload.body,
      }));
    } else {
      return NextResponse.json({ source: "convex", applications: [], error: "Unsupported or incomplete workflow action." }, { status: 400 });
    }

    return NextResponse.json({ source: "convex", applications: await listApplications(client), createdApplicationId });
  } catch (error) {
    return NextResponse.json(
      {
        source: "convex",
        applications: [],
        error: error instanceof Error ? error.message : "Convex workflow action failed.",
      },
      { status: 409 },
    );
  }
}
