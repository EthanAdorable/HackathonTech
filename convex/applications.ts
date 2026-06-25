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

export const list = query({
  args: {
    role: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.role === "Student Officer" && args.userId) {
      return await ctx.db
        .query("applications")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", args.userId as string))
        .collect();
    }
    if (args.role === "Faculty Adviser" && args.userId) {
      return await ctx.db
        .query("applications")
        .withIndex("by_adviser", (q: any) => q.eq("adviserId", args.userId as string))
        .collect();
    }
    return await ctx.db.query("applications").collect();
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

        return { ...application, templates, messages, timeline };
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

    return { ...application, templates, messages, timeline };
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
    await ctx.db.insert("timeline", {
      applicationId: args.applicationId,
      status: args.status,
      note: args.note,
      createdAt: new Date().toISOString(),
    });
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
    await ctx.db.insert("messages", {
      applicationId: args.applicationId,
      author: args.author,
      role: args.role,
      body: args.body,
      createdAt: new Date().toISOString(),
    });
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
      await ctx.db.insert("timeline", {
        applicationId: template.applicationId,
        status: "Template Completion",
        note: "Template fields updated.",
        createdAt: new Date().toISOString(),
      });
    }
  },
});
