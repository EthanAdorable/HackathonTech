import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  canAdministerDemoData,
  canAdministerTemplates,
  canCreateApplication,
  canEditApplication,
  canEndorseApplication,
  canReadApplication,
  canReviewAsSadu,
} from "@/lib/access-policy";
import { getAccessActor } from "@/lib/server-access";
import { withTimeout } from "@/lib/async-timeout";
import type { EventStatus } from "@/lib/tams-data";

type WorkflowRequest = {
  action:
    | "create"
    | "resetDemo"
    | "updateDetails"
    | "updateTemplate"
    | "updateTemplateAvailability"
    | "generateAttachmentUploadUrl"
    | "initializeRequirements"
    | "recordAttachmentUpload"
    | "removeAttachment"
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
  requirementId?: string;
  attachmentId?: string;
  storageId?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  sha256?: string;
  deleteFromStorage?: boolean;
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
  body?: string;
  status?: string;
  note?: string;
};

type Actor = NonNullable<Awaited<ReturnType<typeof getAccessActor>>>;

async function listApplications(client: ConvexHttpClient, actor: Actor) {
  return await withTimeout(client.query(api.applications.listWithDetails, { actor }));
}

async function getApplication(client: ConvexHttpClient, applicationId: Id<"applications">, actor: Actor) {
  const application = await withTimeout(client.query(api.applications.get, { applicationId, actor }));
  if (!application) throw new Error("Application not found.");
  return application;
}

function assertStatus(currentStatus: string, allowed: string[], action: string) {
  if (!allowed.includes(currentStatus)) {
    throw new Error(`${action} is not allowed from ${currentStatus}.`);
  }
}

export async function POST(request: Request) {
  const actor = await getAccessActor();
  if (!actor) {
    return NextResponse.json({ source: "convex", applications: [], error: "Authentication required." }, { status: 401 });
  }

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
    const application = applicationId ? await getApplication(client, applicationId, actor) : null;

    if (payload.action === "resetDemo") {
      if (!canAdministerDemoData(actor)) throw new Error("Only admins can reset demo data.");
      await withTimeout(client.mutation(api.seed.seedDemoData, { actor }));
    } else if (payload.action === "generateAttachmentUploadUrl") {
      if (!canCreateApplication(actor)) throw new Error("Only student officers can upload requirement files.");
      const uploadUrl = await withTimeout(client.mutation(api.applications.generateAttachmentUploadUrl, { actor }));
      return NextResponse.json({ source: "convex", applications: [], uploadUrl });
    } else if (payload.action === "create") {
      if (!canCreateApplication(actor)) throw new Error("Only student officers can create applications.");
      createdApplicationId = await withTimeout(client.mutation(api.applications.create, {
        actor,
        title: payload.title ?? "New Campus Event",
        organization: actor.organization ?? payload.organization ?? "Junior Philippine Computer Society",
        eventType: payload.eventType ?? "Workshop",
        venue: payload.venue ?? "FEU Alabang Auditorium",
        eventDate: payload.eventDate ?? new Date().toISOString().slice(0, 10),
        expectedParticipants: payload.expectedParticipants ?? 40,
        ownerId: actor.id,
        adviserId: payload.adviserId ?? "adviser",
        riskLevel: payload.riskLevel ?? "Low",
        templates: payload.templates ?? [],
      }));
    } else if (payload.action === "updateTemplate") {
      if (!payload.templateDocumentId) throw new Error("Template document is required.");
      await withTimeout(client.mutation(api.applications.updateTemplate, {
        actor,
        templateDocumentId: payload.templateDocumentId as Id<"templates">,
        values: payload.values ?? {},
      }));
    } else if (payload.action === "updateDetails" && applicationId) {
      if (!application || !canEditApplication(actor, application)) throw new Error("Only the application owner can edit event details.");
      assertStatus(application!.status, ["Draft", "Template Completion", "AI Pre-check", "Revision Requested"], "Event detail editing");
      await withTimeout(client.mutation(api.applications.updateDetails, {
        actor,
        applicationId,
        title: payload.title ?? "New Campus Event",
        organization: actor.organization ?? payload.organization ?? "Junior Philippine Computer Society",
        eventType: payload.eventType ?? "Workshop",
        venue: payload.venue ?? "FEU Alabang Auditorium",
        eventDate: payload.eventDate ?? new Date().toISOString().slice(0, 10),
        expectedParticipants: payload.expectedParticipants ?? 40,
      }));
    } else if (payload.action === "updateTemplateAvailability") {
      if (!canAdministerTemplates(actor)) throw new Error("Only admins can change template availability.");
      await withTimeout(client.mutation(api.applications.updateTemplateAvailability, {
        actor,
        templateId: payload.templateId ?? "",
        enabled: payload.enabled ?? true,
      }));
    } else if (payload.action === "initializeRequirements" && applicationId) {
      if (!application || !canReadApplication(actor, application)) throw new Error("You cannot initialize requirements for this application.");
      await withTimeout(client.mutation(api.applications.initializeRequirements, {
        actor,
        applicationId,
      }));
    } else if (payload.action === "recordAttachmentUpload" && applicationId) {
      if (!application || !canEditApplication(actor, application)) throw new Error("Only the application owner can upload requirement files.");
      if (!payload.requirementId || !payload.storageId || !payload.fileName || !payload.contentType || !payload.sizeBytes) {
        throw new Error("Requirement upload metadata is incomplete.");
      }
      await withTimeout(client.mutation(api.applications.recordAttachmentUpload, {
        actor,
        requirementId: payload.requirementId as Id<"templateRequirements">,
        storageId: payload.storageId as Id<"_storage">,
        fileName: payload.fileName,
        contentType: payload.contentType,
        sizeBytes: payload.sizeBytes,
        sha256: payload.sha256,
      }));
    } else if (payload.action === "removeAttachment" && applicationId) {
      if (!application || !canEditApplication(actor, application)) throw new Error("Only the application owner can remove requirement files.");
      if (!payload.attachmentId) throw new Error("Attachment id is required.");
      await withTimeout(client.mutation(api.applications.removeAttachment, {
        actor,
        attachmentId: payload.attachmentId as Id<"attachments">,
        deleteFromStorage: payload.deleteFromStorage,
      }));
    } else if (payload.action === "addMessage" && applicationId) {
      if (!application || !canReadApplication(actor, application)) throw new Error("You cannot message this application.");
      await withTimeout(client.mutation(api.applications.addMessage, {
        actor,
        applicationId,
        body: payload.body ?? "",
      }));
    } else if (payload.action === "updateStatus" && applicationId) {
      if (payload.status === "AI Pre-check") {
        if (!application || !canEditApplication(actor, application)) throw new Error("Only the application owner can run pre-check.");
        assertStatus(application!.status, ["Draft", "Template Completion", "AI Pre-check"], "Pre-check");
      } else if (payload.status === "Pending Adviser Endorsement") {
        if (!application || !canEditApplication(actor, application)) throw new Error("Only the application owner can request adviser endorsement.");
        assertStatus(application!.status, ["AI Pre-check"], "Adviser endorsement request");
      } else if (payload.status === "Submitted to SADU") {
        if (!application || !canEditApplication(actor, application)) throw new Error("Only the application owner can submit to SADU.");
        assertStatus(application!.status, ["AI Pre-check", "Pending Adviser Endorsement"], "Submission");
      } else if (payload.status === "Under Review") {
        if (!canReviewAsSadu(actor)) throw new Error("Only SADU associates or campus administrators can start review.");
        assertStatus(application!.status, ["Submitted to SADU", "Resubmitted"], "SADU review");
      } else {
        throw new Error(`Use the ${payload.status ?? "requested"} workflow action.`);
      }
      await withTimeout(client.mutation(api.applications.updateStatus, {
        actor,
        applicationId,
        status: payload.status as EventStatus,
        note: payload.note ?? "Status updated in TAMS Hub.",
      }));
    } else if (payload.action === "requestRevision" && applicationId) {
      if (!canReviewAsSadu(actor)) throw new Error("Only SADU associates or campus administrators can request revisions.");
      assertStatus(application!.status, ["Under Review"], "Revision request");
      await withTimeout(client.mutation(api.applications.requestRevision, {
        actor,
        applicationId,
        body: payload.body ?? "",
      }));
    } else if (payload.action === "resubmit" && applicationId) {
      if (!application || !canEditApplication(actor, application)) throw new Error("Only the application owner can resubmit.");
      assertStatus(application!.status, ["Revision Requested"], "Resubmission");
      await withTimeout(client.mutation(api.applications.resubmit, {
        actor,
        applicationId,
        note: payload.note,
      }));
    } else if (payload.action === "approve" && applicationId) {
      if (!canReviewAsSadu(actor)) throw new Error("Only SADU associates or campus administrators can approve applications.");
      assertStatus(application!.status, ["Under Review"], "Approval");
      await withTimeout(client.mutation(api.applications.approve, {
        actor,
        applicationId,
        body: payload.body,
      }));
    } else if (payload.action === "reject" && applicationId) {
      if (!canReviewAsSadu(actor)) throw new Error("Only SADU associates or campus administrators can reject applications.");
      assertStatus(application!.status, ["Under Review"], "Rejection");
      await withTimeout(client.mutation(api.applications.reject, {
        actor,
        applicationId,
        body: payload.body,
      }));
    } else if (payload.action === "addEndorsement" && applicationId) {
      if (!application || !canEndorseApplication(actor, application)) throw new Error("Only the assigned faculty adviser can endorse this application.");
      await withTimeout(client.mutation(api.applications.addEndorsement, {
        actor,
        applicationId,
        body: payload.body,
      }));
    } else {
      return NextResponse.json({ source: "convex", applications: [], error: "Unsupported or incomplete workflow action." }, { status: 400 });
    }

    return NextResponse.json({ source: "convex", applications: await listApplications(client, actor), createdApplicationId });
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
