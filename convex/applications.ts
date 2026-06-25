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
