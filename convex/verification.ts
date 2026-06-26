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

const runStatus = v.union(
  v.literal("queued"),
  v.literal("extracting"),
  v.literal("extracted"),
  v.literal("verifying"),
  v.literal("ready_for_sadu"),
  v.literal("blocked_critical"),
  v.literal("needs_human_review"),
  v.literal("failed_schema"),
  v.literal("failed_ai_timeout"),
  v.literal("failed_rubric_unavailable"),
);

const checkStatus = v.union(
  v.literal("pass"),
  v.literal("fail"),
  v.literal("warning"),
  v.literal("manual_review"),
  v.literal("skipped"),
);

const severity = v.union(v.literal("critical"), v.literal("warning"), v.literal("info"));
const method = v.union(v.literal("deterministic"), v.literal("ai_assisted"));

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

function assertCanEditApplication(accessActor: any, application: any) {
  if (accessActor.role !== "Student Officer" || application.ownerId !== accessActor.id) {
    throw new Error("Only the owning student officer can verify submitted documents.");
  }
}

function withUiId(document: any) {
  return document ? { ...document, id: document._id } : document;
}

export const listActiveDocuments = query({
  args: {
    actor,
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    assertCanReadApplication(args.actor, application);
    const documents = await ctx.db
      .query("uploadedDocuments")
      .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
      .collect();
    return documents.filter((document: any) => document.status === "active").map(withUiId);
  },
});

export const latestSummary = query({
  args: {
    actor,
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    assertCanReadApplication(args.actor, application);
    const summaries = await ctx.db
      .query("compiledVerificationSummaries")
      .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
      .collect();
    return withUiId(summaries.sort((a: any, b: any) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null);
  },
});

export const beginExtractionRun = mutation({
  args: {
    actor,
    uploadedDocumentId: v.id("uploadedDocuments"),
    cacheKey: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.uploadedDocumentId);
    if (!document) throw new Error("Uploaded document not found.");
    const application = await ctx.db.get(document.applicationId);
    if (!application) throw new Error("Application not found.");
    assertCanEditApplication(args.actor, application);

    const runId = await ctx.db.insert("extractionRuns", {
      applicationId: document.applicationId,
      uploadedDocumentId: args.uploadedDocumentId,
      attachmentId: document.attachmentId,
      status: "extracting",
      sha256: document.sha256,
      rubricVersionId: document.rubricVersionId,
      extractionSchemaVersion: document.extractionSchemaVersion,
      promptVersion: document.promptVersion,
      cacheKey: args.cacheKey,
      startedAt: new Date().toISOString(),
    });

    return { runId, document: withUiId(document) };
  },
});

export const getCachedExtraction = query({
  args: {
    actor,
    uploadedDocumentId: v.id("uploadedDocuments"),
    cacheKey: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.uploadedDocumentId);
    if (!document) throw new Error("Uploaded document not found.");
    const application = await ctx.db.get(document.applicationId);
    if (!application) throw new Error("Application not found.");
    assertCanReadApplication(args.actor, application);

    const runs = await ctx.db
      .query("extractionRuns")
      .withIndex("by_cache_key", (q: any) => q.eq("cacheKey", args.cacheKey))
      .collect();
    const reusableRun = runs
      .filter((run: any) => run.status !== "extracting" && run.status !== "queued" && run.status !== "failed_ai_timeout")
      .sort((a: any, b: any) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))[0];
    if (!reusableRun) return null;

    const results = await ctx.db
      .query("verificationResults")
      .withIndex("by_extraction_run", (q: any) => q.eq("extractionRunId", reusableRun._id))
      .collect();

    return {
      run: withUiId(reusableRun),
      results: results.map(withUiId),
    };
  },
});

export const saveVerificationOutcome = mutation({
  args: {
    actor,
    extractionRunId: v.id("extractionRuns"),
    status: runStatus,
    extractionJson: v.optional(v.any()),
    extractedTextPreview: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    model: v.optional(v.string()),
    aiSource: v.optional(v.string()),
    results: v.array(
      v.object({
        checkId: v.string(),
        label: v.string(),
        status: checkStatus,
        severity,
        blocking: v.boolean(),
        evidence: v.array(v.string()),
        recommendation: v.string(),
        method,
        confidence: v.number(),
        failureReason: v.optional(v.string()),
      }),
    ),
    summary: v.object({
      status: runStatus,
      rubricVersionId: v.string(),
      documentCount: v.number(),
      criticalFailureCount: v.number(),
      warningCount: v.number(),
      readyForSadu: v.boolean(),
      currentFileSignature: v.string(),
      blockingFindings: v.array(v.any()),
      warnings: v.array(v.any()),
      generatedAt: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.extractionRunId);
    if (!run) throw new Error("Extraction run not found.");
    const application = await ctx.db.get(run.applicationId);
    if (!application) throw new Error("Application not found.");
    assertCanEditApplication(args.actor, application);
    const now = new Date().toISOString();

    await ctx.db.patch(args.extractionRunId, {
      status: args.status,
      extractionJson: args.extractionJson,
      extractedTextPreview: args.extractedTextPreview,
      failureReason: args.failureReason,
      model: args.model,
      aiSource: args.aiSource,
      completedAt: now,
    });

    const previousResults = await ctx.db
      .query("verificationResults")
      .withIndex("by_extraction_run", (q: any) => q.eq("extractionRunId", args.extractionRunId))
      .collect();
    for (const result of previousResults) {
      await ctx.db.delete(result._id);
    }

    for (const result of args.results) {
      await ctx.db.insert("verificationResults", {
        applicationId: run.applicationId,
        uploadedDocumentId: run.uploadedDocumentId,
        extractionRunId: args.extractionRunId,
        rubricVersionId: run.rubricVersionId,
        createdAt: now,
        ...result,
      });
    }

    const summaryId = await ctx.db.insert("compiledVerificationSummaries", {
      applicationId: run.applicationId,
      status: args.summary.status,
      rubricVersionId: args.summary.rubricVersionId,
      documentCount: args.summary.documentCount,
      criticalFailureCount: args.summary.criticalFailureCount,
      warningCount: args.summary.warningCount,
      readyForSadu: args.summary.readyForSadu,
      currentFileSignature: args.summary.currentFileSignature,
      blockingFindings: args.summary.blockingFindings,
      warnings: args.summary.warnings,
      extractionRunIds: [args.extractionRunId],
      generatedAt: args.summary.generatedAt,
    });

    return summaryId;
  },
});

export const listResultsForApplication = query({
  args: {
    actor,
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    assertCanReadApplication(args.actor, application);
    const results = await ctx.db
      .query("verificationResults")
      .withIndex("by_application", (q: any) => q.eq("applicationId", args.applicationId))
      .collect();
    return results.map(withUiId);
  },
});
