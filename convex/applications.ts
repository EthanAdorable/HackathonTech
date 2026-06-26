import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const status = v.union(
  v.literal("Draft"),
  v.literal("Template Completion"),
  v.literal("AI Pre-check"),
  v.literal("Submitted to SADU"),
  v.literal("Under Review"),
  v.literal("Revision Requested"),
  v.literal("Resubmitted"),
  v.literal("SADU Approved"),
  v.literal("Rejected"),
  v.literal("Archived"),
);

async function addTimeline(ctx: any, applicationId: any, nextStatus: string, note: string) {
  await ctx.db.insert("timeline", {
    applicationId,
    status: nextStatus,
    note,
    createdAt: new Date().toISOString(),
  });
}

async function addWorkflowMessage(ctx: any, applicationId: any, author: string, role: string, body: string) {
  await ctx.db.insert("messages", {
    applicationId,
    author,
    role,
    body,
    createdAt: new Date().toISOString(),
  });
}

function withUiId(document: any) {
  return { ...document, id: document._id };
}

function templateWithUiId(document: any) {
  return {
    _creationTime: document._creationTime,
    _id: document._id,
    id: document._id,
    templateDocumentId: document._id,
    applicationId: document.applicationId,
    templateId: document.templateId,
    enabled: document.enabled,
    values: document.values,
  };
}

export const list = query({
  args: {
    role: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.role === "Student Officer" && args.userId) {
      const applications = await ctx.db
        .query("applications")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", args.userId as string))
        .collect();
      return applications.map(withUiId);
    }
    if (args.role === "Faculty Adviser" && args.userId) {
      const applications = await ctx.db
        .query("applications")
        .withIndex("by_adviser", (q: any) => q.eq("adviserId", args.userId as string))
        .collect();
      return applications.map(withUiId);
    }
    const applications = await ctx.db.query("applications").collect();
    return applications.map(withUiId);
  },
});

export const listWithDetails = query({
  args: {
    role: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let applications;
    if (args.role === "Student Officer" && args.userId) {
      applications = await ctx.db
        .query("applications")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", args.userId as string))
        .collect();
    } else if (args.role === "Faculty Adviser" && args.userId) {
      applications = await ctx.db
        .query("applications")
        .withIndex("by_adviser", (q: any) => q.eq("adviserId", args.userId as string))
        .collect();
    } else {
      applications = await ctx.db.query("applications").collect();
    }

    return await Promise.all(
      applications.map(async (application: any) => {
        const [templates, messages, timeline] = await Promise.all([
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
        ]);

        return {
          ...withUiId(application),
          templates: templates.map(templateWithUiId),
          messages: messages.map(withUiId),
          timeline: timeline.map(withUiId),
        };
      }),
    );
  },
});

export const get = query({
  args: {
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) return null;

    const [templates, messages, timeline] = await Promise.all([
      ctx.db
        .query("templates")
        .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
        .collect(),
      ctx.db
        .query("messages")
        .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
        .collect(),
      ctx.db
        .query("timeline")
        .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
        .collect(),
    ]);

    return {
      ...withUiId(application),
      templates: templates.map(templateWithUiId),
      messages: messages.map(withUiId),
      timeline: timeline.map(withUiId),
    };
  },
});

export const create = mutation({
  args: {
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
    const applicationId = await ctx.db.insert("applications", {
      title: args.title,
      organization: args.organization,
      eventType: args.eventType,
      venue: args.venue,
      eventDate: args.eventDate,
      expectedParticipants: args.expectedParticipants,
      ownerId: args.ownerId,
      adviserId: args.adviserId,
      status: "Draft",
      riskLevel: args.riskLevel,
    });

    for (const template of args.templates) {
      await ctx.db.insert("templates", {
        applicationId,
        templateId: template.templateId,
        enabled: template.enabled,
        values: template.values,
      });
    }

    await ctx.db.insert("timeline", {
      applicationId,
      status: "Draft",
      note: "Application created in TAMS Events.",
      createdAt: new Date().toISOString(),
    });

    return applicationId;
  },
});

export const updateStatus = mutation({
  args: {
    applicationId: v.id("applications"),
    status,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.applicationId, { status: args.status });
    await addTimeline(ctx, args.applicationId, args.status, args.note);
  },
});

export const addMessage = mutation({
  args: {
    applicationId: v.id("applications"),
    author: v.string(),
    role: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await addWorkflowMessage(ctx, args.applicationId, args.author, args.role, args.body);
  },
});

export const requestRevision = mutation({
  args: {
    applicationId: v.id("applications"),
    author: v.string(),
    role: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await addWorkflowMessage(ctx, args.applicationId, args.author, args.role, args.body);
    await ctx.db.patch(args.applicationId, { status: "Revision Requested" });
    await addTimeline(ctx, args.applicationId, "Revision Requested", "SADU requested revisions.");
  },
});

export const resubmit = mutation({
  args: {
    applicationId: v.id("applications"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.applicationId, { status: "Resubmitted" });
    await addTimeline(ctx, args.applicationId, "Resubmitted", args.note ?? "Student resubmitted after revision.");
  },
});

export const approve = mutation({
  args: {
    applicationId: v.id("applications"),
    author: v.string(),
    role: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await addWorkflowMessage(
      ctx,
      args.applicationId,
      args.author,
      args.role,
      args.body ?? "Approved. Final decision recorded by SADU reviewer.",
    );
    await ctx.db.patch(args.applicationId, { status: "SADU Approved" });
    await addTimeline(ctx, args.applicationId, "SADU Approved", "SADU approved the application.");
  },
});

export const reject = mutation({
  args: {
    applicationId: v.id("applications"),
    author: v.string(),
    role: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await addWorkflowMessage(
      ctx,
      args.applicationId,
      args.author,
      args.role,
      args.body ?? "Rejected by SADU after human review. Please coordinate before filing again.",
    );
    await ctx.db.patch(args.applicationId, { status: "Rejected" });
    await addTimeline(ctx, args.applicationId, "Rejected", "SADU rejected the application.");
  },
});

export const addEndorsement = mutation({
  args: {
    applicationId: v.id("applications"),
    author: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await addWorkflowMessage(
      ctx,
      args.applicationId,
      args.author,
      "Faculty Adviser",
      args.body ?? "Faculty adviser note: Reviewed for organization coordination. Endorsement placeholder recorded for SADU visibility.",
    );
  },
});

export const updateTemplate = mutation({
  args: {
    templateDocumentId: v.id("templates"),
    values: v.any(),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateDocumentId);
    if (!template) return;

    await ctx.db.patch(args.templateDocumentId, { values: args.values });
    const application = await ctx.db.get(template.applicationId);
    if (application?.status === "Draft") {
      await ctx.db.patch(template.applicationId, { status: "Template Completion" });
      await addTimeline(ctx, template.applicationId, "Template Completion", "Template fields updated.");
    }
  },
});
