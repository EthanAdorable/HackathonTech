import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const role = v.union(
  v.literal("Student Officer"),
  v.literal("SADU Associate"),
  v.literal("Faculty Adviser"),
  v.literal("Admin"),
);

const actor = v.object({
  id: v.string(),
  name: v.string(),
  role,
  organization: v.optional(v.string()),
  title: v.optional(v.string()),
});

const status = v.union(
  v.literal("Draft"),
  v.literal("Template Completion"),
  v.literal("AI Pre-check"),
  v.literal("Pending Adviser Endorsement"),
  v.literal("Submitted to SADU"),
  v.literal("Under Review"),
  v.literal("Revision Requested"),
  v.literal("Resubmitted"),
  v.literal("SADU Approved"),
  v.literal("Rejected"),
  v.literal("Archived"),
);

const defaultRubricVersionId = "app-apf-verf-rubric-v1";
const defaultExtractionSchemaVersion = "app-apf-verf-extraction-v1";
const defaultPromptVersion = "app-apf-verf-prompt-v6";
const verificationDocumentTypes = new Set(["app", "apf", "verf"]);
const formReviewRoles = new Set(["Admin", "SADU Associate"]);

async function addTimeline(ctx: any, applicationId: any, nextStatus: string, note: string, accessActor?: any) {
  await ctx.db.insert("timeline", {
    applicationId,
    status: nextStatus,
    note,
    createdAt: new Date().toISOString(),
    actorId: accessActor?.id,
    actorName: accessActor?.name,
    actorRole: accessActor?.role,
  });
}

async function addWorkflowMessage(ctx: any, applicationId: any, author: string, role: string, body: string, accessActor?: any) {
  await ctx.db.insert("messages", {
    applicationId,
    author,
    role,
    body,
    createdAt: new Date().toISOString(),
    actorId: accessActor?.id,
    actorName: accessActor?.name,
    actorRole: accessActor?.role,
  });
}

function assertApplication(application: any) {
  if (!application) throw new Error("Application not found.");
  return application;
}

function assertStatus(application: any, allowed: string[], action: string) {
  assertApplication(application);
  if (!allowed.includes(application.status)) {
    throw new Error(`${action} is not allowed from ${application.status}.`);
  }
}

function canSeeAllApplications(accessActor: any) {
  return accessActor.role === "Admin" || accessActor.role === "SADU Associate";
}

function canReadApplication(accessActor: any, application: any) {
  if (canSeeAllApplications(accessActor)) return true;
  if (accessActor.role === "Student Officer") return application.ownerId === accessActor.id;
  if (accessActor.role === "Faculty Adviser") return application.adviserId === accessActor.id;
  return false;
}

function assertCanReadApplication(accessActor: any, application: any) {
  if (!canReadApplication(accessActor, application)) {
    throw new Error("You are not allowed to read this application.");
  }
}

function assertCanCreateApplication(accessActor: any) {
  if (accessActor.role !== "Student Officer") {
    throw new Error("Only student officers can create applications.");
  }
}

function assertCanEditApplication(accessActor: any, application: any) {
  if (accessActor.role !== "Student Officer" || application.ownerId !== accessActor.id) {
    throw new Error("Only the owning student officer can edit this application.");
  }
}

function assertCanReviewAsSadu(accessActor: any) {
  if (!formReviewRoles.has(accessActor.role)) {
    throw new Error("Only campus administrators or SADU associates can perform form review actions.");
  }
}

function assertCanEndorseApplication(accessActor: any, application: any) {
  if (accessActor.role !== "Faculty Adviser" || application.adviserId !== accessActor.id) {
    throw new Error("Only the assigned faculty adviser can endorse this application.");
  }
}

function assertCanAdminister(accessActor: any) {
  if (accessActor.role !== "Admin") {
    throw new Error("Only admins can administer TAMS Hub demo data and templates.");
  }
}

function isAdviserEndorsementComplete(application: any) {
  const required = application.adviserEndorsementRequired ?? (application.expectedParticipants >= 100 || application.riskLevel !== "Low");
  return !required || application.adviserEndorsementState === "Endorsed";
}

async function applicationsForActor(ctx: any, accessActor: any) {
  if (accessActor.role === "Student Officer") {
    return await ctx.db
      .query("applications")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", accessActor.id))
      .collect();
  }
  if (accessActor.role === "Faculty Adviser") {
    return await ctx.db
      .query("applications")
      .withIndex("by_adviser", (q: any) => q.eq("adviserId", accessActor.id))
      .collect();
  }
  if (canSeeAllApplications(accessActor)) {
    return await ctx.db.query("applications").collect();
  }
  return [];
}

function requiredTemplateGaps(templates: any[]) {
  const requiredFieldsByTemplate: Record<string, string[]> = {};

  return templates.flatMap((template) => {
    if (!template.enabled) return [];
    const requiredFields = requiredFieldsByTemplate[template.templateId] ?? [];
    return requiredFields.filter((field) => !String(template.values?.[field] ?? "").trim());
  });
}

const defaultRequirementDefinitionsByTemplate: Record<
  string,
  Array<{
    requirementKey: string;
    label: string;
    description?: string;
    required: boolean;
    visibleToReviewer: boolean;
    accepts?: string[];
    maxSizeBytes?: number;
  }>
> = {
  app: [
    {
      requirementKey: "completed-app",
      label: "APP FORM",
      description: "Activity / Program Proposal with event, schedule, venue, budget, and approval evidence.",
      required: true,
      visibleToReviewer: true,
      accepts: ["application/pdf"],
      maxSizeBytes: 10 * 1024 * 1024,
    },
  ],
  apf: [
    {
      requirementKey: "completed-apf",
      label: "APF FORM",
      description: "Activity Profile with programme, participants, budget, committees, and signatories.",
      required: true,
      visibleToReviewer: true,
      accepts: ["application/pdf"],
      maxSizeBytes: 10 * 1024 * 1024,
    },
  ],
  verf: [
    {
      requirementKey: "completed-verf",
      label: "VERF FORM",
      description: "Venue and Equipment Reservation Form as a PDF or scanned image.",
      required: true,
      visibleToReviewer: true,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
      maxSizeBytes: 10 * 1024 * 1024,
    },
  ],
  publicity: [
    {
      requirementKey: "publicity-publication-post",
      label: "Publicity Publication Post",
      description: "Final or draft publication materials for review.",
      required: false,
      visibleToReviewer: true,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
      maxSizeBytes: 10 * 1024 * 1024,
    },
  ],
  speaker: [
    {
      requirementKey: "speaker-guest-request",
      label: "Speaker guest request",
      description: "Invitation letter, confirmation, or equivalent coordination proof.",
      required: false,
      visibleToReviewer: true,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
      maxSizeBytes: 10 * 1024 * 1024,
    },
  ],
};
const allowedTemplateIds = new Set(Object.keys(defaultRequirementDefinitionsByTemplate));

async function insertDefaultRequirements(ctx: any, templateDocument: any) {
  const definitions = defaultRequirementDefinitionsByTemplate[templateDocument.templateId] ?? [];
  for (let index = 0; index < definitions.length; index += 1) {
    const requirement = definitions[index];
    await ctx.db.insert("templateRequirements", {
      applicationId: templateDocument.applicationId,
      templateDocumentId: templateDocument._id,
      templateId: templateDocument.templateId,
      requirementKey: requirement.requirementKey,
      label: requirement.label,
      description: requirement.description,
      required: requirement.required,
      visibleToReviewer: requirement.visibleToReviewer,
      accepts: requirement.accepts,
      maxSizeBytes: requirement.maxSizeBytes,
      sortOrder: index,
    });
  }
}

async function ensureDefaultRequirementsForTemplate(ctx: any, templateDocument: any) {
  const existing = await ctx.db
    .query("templateRequirements")
    .withIndex("by_template", (q: any) => q.eq("templateDocumentId", templateDocument._id))
    .collect();
  if (existing.length) return existing;
  await insertDefaultRequirements(ctx, templateDocument);
  return await ctx.db
    .query("templateRequirements")
    .withIndex("by_template", (q: any) => q.eq("templateDocumentId", templateDocument._id))
    .collect();
}

async function activeAttachmentsForApplication(ctx: any, applicationId: any) {
  const attachments = await ctx.db
    .query("attachments")
    .withIndex("by_application", (q: any) => q.eq("applicationId", applicationId))
    .collect();
  return attachments.filter((attachment: any) => attachment.status === "active");
}

async function activeUploadedDocumentsForApplication(ctx: any, applicationId: any) {
  const documents = await ctx.db
    .query("uploadedDocuments")
    .withIndex("by_application", (q: any) => q.eq("applicationId", applicationId))
    .collect();
  return documents.filter((document: any) => document.status === "active");
}

async function latestVerificationSummaryForApplication(ctx: any, applicationId: any) {
  const summaries = await ctx.db
    .query("compiledVerificationSummaries")
    .withIndex("by_application", (q: any) => q.eq("applicationId", applicationId))
    .collect();
  return summaries.sort((a: any, b: any) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null;
}

function activeDocumentSignature(documents: any[]) {
  const parts = documents
    .filter((document) => verificationDocumentTypes.has(document.documentType))
    .map((document) => [
      document.documentType,
      document.sha256,
      document.rubricVersionId,
      document.extractionSchemaVersion,
      document.promptVersion,
    ].join(":"))
    .sort();
  return parts.length ? parts.join("|") : "no-files";
}

function requiredAttachmentGaps(templates: any[], requirements: any[], activeAttachments: any[]) {
  const enabledTemplateIds = new Set(templates.filter((template) => template.enabled).map((template) => template._id));
  const activeRequirementIds = new Set(activeAttachments.map((attachment) => attachment.requirementId));
  return requirements
    .filter((requirement) => requirement.required && enabledTemplateIds.has(requirement.templateDocumentId))
    .filter((requirement) => !activeRequirementIds.has(requirement._id))
    .map((requirement) => requirement.label);
}

function makeReadiness(templates: any[], requirements: any[], activeAttachments: any[], activeDocuments: any[] = [], verificationSummary: any = null) {
  const missingFields = requiredTemplateGaps(templates);
  const missingAttachments = requiredAttachmentGaps(templates, requirements, activeAttachments);
  const missingVerification = verificationGaps(activeAttachments, activeDocuments, verificationSummary);
  return {
    ready: missingFields.length === 0 && missingAttachments.length === 0 && missingVerification.length === 0,
    missingFields,
    missingAttachments,
    missingVerification,
  };
}

function verificationGaps(activeAttachments: any[], activeDocuments: any[], verificationSummary: any) {
  if (!activeAttachments.length) return [];
  const signature = activeDocumentSignature(activeDocuments);
  if (!verificationSummary) return ["Run document verification for the current uploaded files."];
  if (verificationSummary.currentFileSignature !== signature) {
    return ["Run document verification again because uploaded files changed."];
  }
  if (!verificationSummary.readyForSadu) {
    const findings = verificationSummary.blockingFindings?.map((finding: any) => `${finding.label}: ${finding.recommendation}`) ?? [];
    return findings.length ? findings : [`Document verification is ${verificationSummary.status}.`];
  }
  return [];
}

async function getApplicationReadiness(ctx: any, applicationId: any) {
  const [templates, requirements, activeAttachments, activeDocuments, verificationSummary] = await Promise.all([
    ctx.db
      .query("templates")
      .withIndex("by_application", (q: any) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("templateRequirements")
      .withIndex("by_application", (q: any) => q.eq("applicationId", applicationId))
      .collect(),
    activeAttachmentsForApplication(ctx, applicationId),
    activeUploadedDocumentsForApplication(ctx, applicationId),
    latestVerificationSummaryForApplication(ctx, applicationId),
  ]);
  return {
    templates,
    requirements,
    activeAttachments,
    activeDocuments,
    verificationSummary,
    readiness: makeReadiness(templates, requirements, activeAttachments, activeDocuments, verificationSummary),
  };
}

function withUiId(document: any) {
  return { ...document, id: document._id };
}

function applicationWithUiId(document: any) {
  const required = document.adviserEndorsementRequired ?? (document.expectedParticipants >= 100 || document.riskLevel !== "Low");
  return {
    ...withUiId(document),
    adviserEndorsement: {
      required,
      state: document.adviserEndorsementState ?? (required ? "Pending" : "Not Required"),
      actorId: document.adviserEndorsementActorId,
      actorName: document.adviserEndorsementActorName,
      actorRole: document.adviserEndorsementActorRole,
      timestamp: document.adviserEndorsementTimestamp,
      notes: document.adviserEndorsementNotes,
    },
  };
}

function attachmentWithUiId(document: any, url?: string | null) {
  const version = {
    id: `${document._id}-v${document.revision}`,
    fileName: document.fileName,
    size: document.sizeBytes,
    uploadedAt: document.createdAt,
    uploadedBy: document.uploadedBy,
    revision: document.revision,
    note: document.revision > 1 ? "Replacement uploaded after revision." : "Initial upload.",
  };

  return {
    ...document,
    id: document._id,
    attachmentId: document._id,
    size: document.sizeBytes,
    mimeType: document.contentType,
    uploadedAt: document.createdAt,
    status: document.status === "active" ? "uploaded" : document.status,
    reviewerVisible: true,
    versions: [version],
    url,
  };
}

function requirementWithUiId(document: any, activeAttachment?: any, url?: string | null) {
  return {
    ...document,
    id: document._id,
    requirementId: document._id,
    uploadStatus: activeAttachment ? "uploaded" : document.required ? "missing" : "optional",
    activeAttachment: activeAttachment ? attachmentWithUiId(activeAttachment, url) : null,
  };
}

function templateWithUiId(document: any, requirements: any[] = []) {
  const attachments = requirements
    .map((requirement: any) => requirement.activeAttachment)
    .filter(Boolean);

  return {
    _creationTime: document._creationTime,
    _id: document._id,
    id: document._id,
    templateDocumentId: document._id,
    applicationId: document.applicationId,
    templateId: document.templateId,
    enabled: document.enabled,
    values: document.values,
    attachments,
    requirements,
  };
}

async function hydrateApplication(ctx: any, application: any) {
  const [templates, messages, timeline, requirements, attachments] = await Promise.all([
    ctx.db
      .query("templates")
      .withIndex("by_application", (q: any) => q.eq("applicationId", application._id))
      .collect(),
    ctx.db
      .query("messages")
      .withIndex("by_application", (q: any) => q.eq("applicationId", application._id))
      .collect(),
    ctx.db
      .query("timeline")
      .withIndex("by_application", (q: any) => q.eq("applicationId", application._id))
      .collect(),
    ctx.db
      .query("templateRequirements")
      .withIndex("by_application", (q: any) => q.eq("applicationId", application._id))
      .collect(),
    ctx.db
      .query("attachments")
      .withIndex("by_application", (q: any) => q.eq("applicationId", application._id))
      .collect(),
  ]);
  const [activeDocuments, verificationSummary] = await Promise.all([
    activeUploadedDocumentsForApplication(ctx, application._id),
    latestVerificationSummaryForApplication(ctx, application._id),
  ]);

  const activeAttachments = attachments.filter((attachment: any) => attachment.status === "active");
  const activeByRequirement = new Map<any, any>(activeAttachments.map((attachment: any) => [attachment.requirementId, attachment]));
  const urlsByAttachment = new Map<any, string | null>();
  await Promise.all(
    activeAttachments.map(async (attachment: any) => {
      urlsByAttachment.set(attachment._id, await ctx.storage.getUrl(attachment.storageId));
    }),
  );

  const requirementsByTemplate = new Map<any, any[]>();
  for (const requirement of requirements) {
    const activeAttachment = activeByRequirement.get(requirement._id) as any | undefined;
    const hydrated = requirementWithUiId(
      requirement,
      activeAttachment,
      activeAttachment ? urlsByAttachment.get(activeAttachment._id) : null,
    );
    requirementsByTemplate.set(requirement.templateDocumentId, [
      ...(requirementsByTemplate.get(requirement.templateDocumentId) ?? []),
      hydrated,
    ]);
  }

  return {
    ...applicationWithUiId(application),
    templates: templates.map((template: any) => templateWithUiId(template, requirementsByTemplate.get(template._id) ?? [])),
    requirements: requirements.map((requirement: any) => {
      const activeAttachment = activeByRequirement.get(requirement._id) as any | undefined;
      return requirementWithUiId(
        requirement,
        activeAttachment,
        activeAttachment ? urlsByAttachment.get(activeAttachment._id) : null,
      );
    }),
    attachments: attachments.map((attachment: any) =>
      attachmentWithUiId(attachment, attachment.status === "active" ? urlsByAttachment.get(attachment._id) : null),
    ),
    readiness: makeReadiness(templates, requirements, activeAttachments, activeDocuments, verificationSummary),
    verificationSummary: verificationSummary ? withUiId(verificationSummary) : null,
    messages: messages.map(withUiId),
    timeline: timeline.map(withUiId),
  };
}

export const list = query({
  args: {
    actor,
  },
  handler: async (ctx, args) => {
    const applications = await applicationsForActor(ctx, args.actor);
    return applications.map(applicationWithUiId);
  },
});

export const listWithDetails = query({
  args: {
    actor,
  },
  handler: async (ctx, args) => {
    const applications = await applicationsForActor(ctx, args.actor);

    return await Promise.all(
      applications.map(async (application: any) => hydrateApplication(ctx, application)),
    );
  },
});

export const get = query({
  args: {
    actor,
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) return null;
    assertCanReadApplication(args.actor, application);

    return await hydrateApplication(ctx, application);
  },
});

export const create = mutation({
  args: {
    actor,
    title: v.string(),
    organization: v.string(),
    eventType: v.string(),
    venue: v.string(),
    eventDate: v.string(),
    expectedParticipants: v.number(),
    ownerId: v.string(),
    adviserId: v.string(),
    riskLevel: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
    templates: v.array(
      v.object({
        templateId: v.string(),
        enabled: v.boolean(),
        values: v.any(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    assertCanCreateApplication(args.actor);
    if (args.ownerId !== args.actor.id) {
      throw new Error("Student officers can only create applications for themselves.");
    }
    const applicationId = await ctx.db.insert("applications", {
      title: args.title,
      organization: args.organization,
      eventType: args.eventType,
      venue: args.venue,
      eventDate: args.eventDate,
      expectedParticipants: args.expectedParticipants,
      ownerId: args.actor.id,
      adviserId: args.adviserId,
      status: "Draft",
      riskLevel: args.riskLevel,
      adviserEndorsementRequired: args.expectedParticipants >= 100 || args.riskLevel !== "Low",
      adviserEndorsementState: args.expectedParticipants >= 100 || args.riskLevel !== "Low" ? "Pending" : "Not Required",
    });

    for (const template of args.templates) {
      if (!allowedTemplateIds.has(template.templateId)) continue;
      const templateDocumentId = await ctx.db.insert("templates", {
        applicationId,
        templateId: template.templateId,
        enabled: template.enabled,
        values: template.values,
      });
      await insertDefaultRequirements(ctx, {
        _id: templateDocumentId,
        applicationId,
        templateId: template.templateId,
      });
    }

    await ctx.db.insert("timeline", {
      applicationId,
      status: "Draft",
      note: "Application created in TAMS Events.",
      createdAt: new Date().toISOString(),
      actorId: args.actor.id,
      actorName: args.actor.name,
      actorRole: args.actor.role,
    });

    return applicationId;
  },
});

export const updateStatus = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    status,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    if (args.status === "AI Pre-check") {
      assertCanEditApplication(args.actor, application);
      assertStatus(application, ["Draft", "Template Completion", "AI Pre-check"], "Pre-check");
    } else if (args.status === "Pending Adviser Endorsement") {
      assertCanEditApplication(args.actor, application);
      assertStatus(application, ["AI Pre-check"], "Adviser endorsement request");
      const { readiness } = await getApplicationReadiness(ctx, args.applicationId);
      if (!readiness.ready) {
        throw new Error(
          `Adviser endorsement requires all required fields and attachments. Missing fields: ${
            readiness.missingFields.join(", ") || "none"
          }. Missing attachments: ${readiness.missingAttachments.join(", ") || "none"}. Verification: ${
            readiness.missingVerification.join(", ") || "ready"
          }.`,
        );
      }
    } else if (args.status === "Submitted to SADU") {
      assertCanEditApplication(args.actor, application);
      assertStatus(application, ["AI Pre-check", "Pending Adviser Endorsement"], "Submission");
      const { readiness } = await getApplicationReadiness(ctx, args.applicationId);
      if (!readiness.ready) {
        throw new Error(
          `Submission is not ready. Missing fields: ${readiness.missingFields.join(", ") || "none"}. Missing attachments: ${
            readiness.missingAttachments.join(", ") || "none"
          }. Verification: ${readiness.missingVerification.join(", ") || "ready"}.`,
        );
      }
      if (!isAdviserEndorsementComplete(application)) {
        throw new Error("Submission to SADU requires faculty adviser endorsement.");
      }
    } else if (args.status === "Under Review") {
      assertCanReviewAsSadu(args.actor);
      assertStatus(application, ["Submitted to SADU", "Resubmitted"], "SADU review");
    } else if (["Revision Requested", "Resubmitted", "SADU Approved", "Rejected"].includes(args.status)) {
      throw new Error(`Use the ${args.status} workflow action.`);
    }
    await ctx.db.patch(args.applicationId, { status: args.status });
    await addTimeline(ctx, args.applicationId, args.status, args.note, args.actor);
  },
});

export const updateDetails = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    title: v.string(),
    organization: v.string(),
    eventType: v.string(),
    venue: v.string(),
    eventDate: v.string(),
    expectedParticipants: v.number(),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanEditApplication(args.actor, application);
    assertStatus(application, ["Draft", "Template Completion", "AI Pre-check", "Revision Requested"], "Event detail editing");
    await ctx.db.patch(args.applicationId, {
      title: args.title,
      organization: args.organization,
      eventType: args.eventType,
      venue: args.venue,
      eventDate: args.eventDate,
      expectedParticipants: args.expectedParticipants,
      status: application.status === "Draft" ? "Template Completion" : application.status,
    });
    if (application.status === "Draft") {
      await addTimeline(ctx, args.applicationId, "Template Completion", "Event details updated.", args.actor);
    }
  },
});

export const addMessage = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanReadApplication(args.actor, application);
    await addWorkflowMessage(ctx, args.applicationId, args.actor.name, args.actor.role, args.body, args.actor);
  },
});

export const requestRevision = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanReviewAsSadu(args.actor);
    assertStatus(application, ["Under Review"], "Revision request");
    await addWorkflowMessage(ctx, args.applicationId, args.actor.name, args.actor.role, args.body, args.actor);
    await ctx.db.patch(args.applicationId, { status: "Revision Requested" });
    await addTimeline(ctx, args.applicationId, "Revision Requested", "SADU requested revisions.", args.actor);
  },
});

export const resubmit = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanEditApplication(args.actor, application);
    assertStatus(application, ["Revision Requested"], "Resubmission");
    const { readiness } = await getApplicationReadiness(ctx, args.applicationId);
    if (!readiness.ready) {
      throw new Error(
        `Resubmission requires all required fields and attachments. Missing fields: ${
          readiness.missingFields.join(", ") || "none"
        }. Missing attachments: ${readiness.missingAttachments.join(", ") || "none"}. Verification: ${
          readiness.missingVerification.join(", ") || "ready"
        }.`,
      );
    }
    await ctx.db.patch(args.applicationId, { status: "Resubmitted" });
    await addTimeline(ctx, args.applicationId, "Resubmitted", args.note ?? "Student resubmitted after revision.", args.actor);
  },
});

export const approve = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanReviewAsSadu(args.actor);
    assertStatus(application, ["Under Review"], "Approval");
    if (!isAdviserEndorsementComplete(application)) {
      throw new Error("SADU approval requires faculty adviser endorsement.");
    }
    await addWorkflowMessage(
      ctx,
      args.applicationId,
      args.actor.name,
      args.actor.role,
      args.body ?? "Approved. Final decision recorded by SADU reviewer.",
      args.actor,
    );
    await ctx.db.patch(args.applicationId, { status: "SADU Approved" });
    await addTimeline(ctx, args.applicationId, "SADU Approved", "SADU approved the application.", args.actor);
  },
});

export const reject = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanReviewAsSadu(args.actor);
    assertStatus(application, ["Under Review"], "Rejection");
    await addWorkflowMessage(
      ctx,
      args.applicationId,
      args.actor.name,
      args.actor.role,
      args.body ?? "Rejected by SADU after human review. Please coordinate before filing again.",
      args.actor,
    );
    await ctx.db.patch(args.applicationId, { status: "Rejected" });
    await addTimeline(ctx, args.applicationId, "Rejected", "SADU rejected the application.", args.actor);
  },
});

export const addEndorsement = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanEndorseApplication(args.actor, application);
    assertStatus(application, ["Pending Adviser Endorsement"], "Adviser endorsement");
    const timestamp = new Date().toISOString();
    await addWorkflowMessage(
      ctx,
      args.applicationId,
      args.actor.name,
      args.actor.role,
      args.body ?? "Reviewed and endorsed for SADU review.",
      args.actor,
    );
    await ctx.db.patch(args.applicationId, {
      status: "Submitted to SADU",
      adviserEndorsementRequired: true,
      adviserEndorsementState: "Endorsed",
      adviserEndorsementActorId: args.actor.id,
      adviserEndorsementActorName: args.actor.name,
      adviserEndorsementActorRole: args.actor.role,
      adviserEndorsementTimestamp: timestamp,
      adviserEndorsementNotes: args.body ?? "Reviewed and endorsed for SADU review.",
    });
    await addTimeline(ctx, args.applicationId, "Submitted to SADU", "Faculty adviser endorsed the application for SADU review.", args.actor);
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    actor,
  },
  handler: async (ctx, args) => {
    if (args.actor.role !== "Student Officer") {
      throw new Error("Only student officers can upload application documents.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const getReadiness = query({
  args: {
    actor,
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanReadApplication(args.actor, application);
    const { readiness } = await getApplicationReadiness(ctx, args.applicationId);
    return readiness;
  },
});

export const listRequirements = query({
  args: {
    actor,
    applicationId: v.id("applications"),
    reviewerOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanReadApplication(args.actor, application);
    const [requirements, activeAttachments] = await Promise.all([
      ctx.db
        .query("templateRequirements")
        .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
        .collect(),
      activeAttachmentsForApplication(ctx, args.applicationId),
    ]);
    const activeByRequirement = new Map<any, any>(
      activeAttachments.map((attachment: any) => [attachment.requirementId, attachment]),
    );
    return await Promise.all(
      requirements
        .filter((requirement: any) => !args.reviewerOnly || requirement.visibleToReviewer)
        .map(async (requirement: any) => {
          const activeAttachment = activeByRequirement.get(requirement._id);
          const url = activeAttachment ? await ctx.storage.getUrl(activeAttachment.storageId) : null;
          return requirementWithUiId(requirement, activeAttachment, url);
        }),
    );
  },
});

export const recordAttachmentUpload = mutation({
  args: {
    actor,
    requirementId: v.id("templateRequirements"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requirement = assertApplication(await ctx.db.get(args.requirementId));
    const application = assertApplication(await ctx.db.get(requirement.applicationId));
    assertCanEditApplication(args.actor, application);
    assertStatus(
      application,
      ["Draft", "Template Completion", "AI Pre-check", "Revision Requested"],
      "Requirement upload",
    );
    if (requirement.maxSizeBytes && args.sizeBytes > requirement.maxSizeBytes) {
      throw new Error(`File exceeds the ${requirement.maxSizeBytes} byte limit for ${requirement.label}.`);
    }
    if (requirement.accepts?.length && !requirement.accepts.includes(args.contentType)) {
      throw new Error(`${args.contentType} is not accepted for ${requirement.label}.`);
    }

    const existingAttachments = await ctx.db
      .query("attachments")
      .withIndex("by_requirement", (q: any) => q.eq("requirementId", args.requirementId))
      .collect();
    const activeAttachment = existingAttachments.find((attachment: any) => attachment.status === "active");
    const revision = existingAttachments.reduce((max: number, attachment: any) => Math.max(max, attachment.revision), 0) + 1;
    const now = new Date().toISOString();

    const attachmentId = await ctx.db.insert("attachments", {
      applicationId: requirement.applicationId,
      templateDocumentId: requirement.templateDocumentId,
      requirementId: args.requirementId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      sha256: args.sha256,
      uploadedBy: args.actor.name,
      uploadedByRole: args.actor.role,
      revision,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    if (activeAttachment) {
      await ctx.db.patch(activeAttachment._id, {
        status: "replaced",
        updatedAt: now,
        replacedBy: attachmentId,
      });
    }

    const activeDocuments = await ctx.db
      .query("uploadedDocuments")
      .withIndex("by_application", (q: any) => q.eq("applicationId", requirement.applicationId))
      .collect();
    for (const document of activeDocuments.filter((document: any) => document.requirementId === args.requirementId && document.status === "active")) {
      await ctx.db.patch(document._id, { status: "replaced", updatedAt: now });
    }

    await ctx.db.insert("uploadedDocuments", {
      applicationId: requirement.applicationId,
      attachmentId,
      templateDocumentId: requirement.templateDocumentId,
      requirementId: args.requirementId,
      storageId: args.storageId,
      sha256: args.sha256 ?? `${attachmentId}:${args.sizeBytes}`,
      mimeType: args.contentType,
      sizeBytes: args.sizeBytes,
      originalName: args.fileName,
      documentType: requirement.templateId,
      uploadedBy: args.actor.name,
      uploadedByRole: args.actor.role,
      rubricVersionId: defaultRubricVersionId,
      extractionSchemaVersion: defaultExtractionSchemaVersion,
      promptVersion: defaultPromptVersion,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    if (application.status === "Draft") {
      await ctx.db.patch(requirement.applicationId, { status: "Template Completion" });
      await addTimeline(ctx, requirement.applicationId, "Template Completion", "Requirement document uploaded.", args.actor);
    }

    return attachmentId;
  },
});

export const removeAttachment = mutation({
  args: {
    actor,
    attachmentId: v.id("attachments"),
    deleteFromStorage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const attachment = assertApplication(await ctx.db.get(args.attachmentId)) as any;
    const application = assertApplication(await ctx.db.get(attachment.applicationId));
    assertCanEditApplication(args.actor, application);
    assertStatus(
      application,
      ["Draft", "Template Completion", "AI Pre-check", "Revision Requested"],
      "Requirement attachment removal",
    );
    if (attachment.status !== "active") {
      throw new Error("Only the active attachment can be removed.");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.attachmentId, {
      status: "removed",
      updatedAt: now,
      removedAt: now,
    });
    if (args.deleteFromStorage) {
      await ctx.storage.delete(attachment.storageId);
    }
    const activeDocuments = await ctx.db
      .query("uploadedDocuments")
      .withIndex("by_attachment", (q: any) => q.eq("attachmentId", args.attachmentId))
      .collect();
    for (const document of activeDocuments.filter((document: any) => document.status === "active")) {
      await ctx.db.patch(document._id, { status: "removed", updatedAt: now });
    }
    return args.attachmentId;
  },
});

export const initializeRequirements = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const application = assertApplication(await ctx.db.get(args.applicationId));
    assertCanReadApplication(args.actor, application);
    const templates = await ctx.db
      .query("templates")
      .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
      .collect();
    const requirements = [];
    for (const template of templates) {
      requirements.push(...(await ensureDefaultRequirementsForTemplate(ctx, template)));
    }
    return requirements.map(withUiId);
  },
});

export const updateTemplate = mutation({
  args: {
    actor,
    templateDocumentId: v.id("templates"),
    values: v.any(),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateDocumentId);
    if (!template) return;
    const application = assertApplication(await ctx.db.get(template.applicationId));
    assertCanEditApplication(args.actor, application);

    await ctx.db.patch(args.templateDocumentId, { values: { ...(template.values ?? {}), ...args.values } });
    if (application?.status === "Draft") {
      await ctx.db.patch(template.applicationId, { status: "Template Completion" });
      await addTimeline(ctx, template.applicationId, "Template Completion", "Template fields updated.", args.actor);
    }
  },
});

export const updateTemplateAvailability = mutation({
  args: {
    actor,
    templateId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    assertCanAdminister(args.actor);
    const templates = await ctx.db
      .query("templates")
      .filter((q) => q.eq(q.field("templateId"), args.templateId))
      .collect();

    for (const template of templates) {
      await ctx.db.patch(template._id, { enabled: args.enabled });
    }
  },
});
