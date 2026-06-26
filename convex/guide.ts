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

function withUiId(document: any) {
  return { ...document, id: document._id };
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

async function assertCanReadApplication(ctx: any, accessActor: any, applicationId: any) {
  const application = await ctx.db.get(applicationId);
  if (!application || !canReadApplication(accessActor, application)) {
    throw new Error("You are not allowed to access guide logs for this application.");
  }
}

export const record = mutation({
  args: {
    actor,
    applicationId: v.id("applications"),
    mode: v.string(),
    question: v.optional(v.string()),
    source: v.string(),
    lines: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCanReadApplication(ctx, args.actor, args.applicationId);
    return await ctx.db.insert("guideLogs", {
      applicationId: args.applicationId,
      actorId: args.actor.id,
      actorRole: args.actor.role,
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
    actor,
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    await assertCanReadApplication(ctx, args.actor, args.applicationId);
    const logs = await ctx.db
      .query("guideLogs")
      .withIndex("by_application", (q) => q.eq("applicationId", args.applicationId))
      .collect();

    return logs.map(withUiId);
  },
});
