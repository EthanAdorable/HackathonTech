import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function withUiId(document: any) {
  return { ...document, id: document._id };
}

export const record = mutation({
  args: {
    applicationId: v.id("applications"),
    mode: v.string(),
    question: v.optional(v.string()),
    source: v.string(),
    lines: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("guideLogs", {
      applicationId: args.applicationId,
      mode: args.mode,
      question: args.question,
      source: args.source,
      lines: args.lines,
      createdAt: new Date().toISOString(),
    });
  },
});

export const listForApplication = query({
  args: {
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("guideLogs")
      .withIndex("by_application", (q) => q.eq("applicationId", args.applicationId))
      .collect();

    return logs.map(withUiId);
  },
});
