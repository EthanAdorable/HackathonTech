import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    role: v.union(
      v.literal("Student Officer"),
      v.literal("SADU Associate"),
      v.literal("Faculty Adviser"),
      v.literal("Admin"),
    ),
    organization: v.optional(v.string()),
    title: v.string(),
  }).index("by_role", ["role"]),
  applications: defineTable({
    title: v.string(),
    organization: v.string(),
    eventType: v.string(),
    venue: v.string(),
    eventDate: v.string(),
    expectedParticipants: v.number(),
    ownerId: v.string(),
    adviserId: v.string(),
    status: v.union(
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
    ),
    riskLevel: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
    adviserEndorsementRequired: v.optional(v.boolean()),
    adviserEndorsementState: v.optional(v.union(v.literal("Not Required"), v.literal("Pending"), v.literal("Endorsed"))),
    adviserEndorsementActorId: v.optional(v.string()),
    adviserEndorsementActorName: v.optional(v.string()),
    adviserEndorsementActorRole: v.optional(v.string()),
    adviserEndorsementTimestamp: v.optional(v.string()),
    adviserEndorsementNotes: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_adviser", ["adviserId"])
    .index("by_status", ["status"]),
  templates: defineTable({
    applicationId: v.id("applications"),
    templateId: v.string(),
    enabled: v.boolean(),
    values: v.any(),
  }).index("by_application", ["applicationId"]),
  templateRequirements: defineTable({
    applicationId: v.id("applications"),
    templateDocumentId: v.id("templates"),
    templateId: v.string(),
    requirementKey: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
    visibleToReviewer: v.boolean(),
    accepts: v.optional(v.array(v.string())),
    maxSizeBytes: v.optional(v.number()),
    sortOrder: v.number(),
  })
    .index("by_application", ["applicationId"])
    .index("by_template", ["templateDocumentId"])
    .index("by_requirement_key", ["applicationId", "templateId", "requirementKey"]),
  attachments: defineTable({
    applicationId: v.id("applications"),
    templateDocumentId: v.id("templates"),
    requirementId: v.id("templateRequirements"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    uploadedBy: v.string(),
    uploadedByRole: v.string(),
    revision: v.number(),
    status: v.union(v.literal("active"), v.literal("replaced"), v.literal("removed")),
    createdAt: v.string(),
    updatedAt: v.string(),
    removedAt: v.optional(v.string()),
    replacedBy: v.optional(v.id("attachments")),
  })
    .index("by_application", ["applicationId"])
    .index("by_requirement", ["requirementId"])
    .index("by_storage", ["storageId"]),
  messages: defineTable({
    applicationId: v.id("applications"),
    author: v.string(),
    role: v.string(),
    body: v.string(),
    createdAt: v.string(),
    actorId: v.optional(v.string()),
    actorName: v.optional(v.string()),
    actorRole: v.optional(v.string()),
  }).index("by_application", ["applicationId"]),
  timeline: defineTable({
    applicationId: v.id("applications"),
    status: v.string(),
    note: v.string(),
    createdAt: v.string(),
    actorId: v.optional(v.string()),
    actorName: v.optional(v.string()),
    actorRole: v.optional(v.string()),
  }).index("by_application", ["applicationId"]),
  guideLogs: defineTable({
    applicationId: v.id("applications"),
    actorId: v.string(),
    actorRole: v.string(),
    mode: v.string(),
    question: v.optional(v.string()),
    source: v.string(),
    lines: v.array(v.string()),
    createdAt: v.string(),
  }).index("by_application", ["applicationId"]),
});
