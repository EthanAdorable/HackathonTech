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
      v.literal("Submitted to SADU"),
      v.literal("Under Review"),
      v.literal("Revision Requested"),
      v.literal("Resubmitted"),
      v.literal("SADU Approved"),
      v.literal("Rejected"),
      v.literal("Archived"),
    ),
    riskLevel: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
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
  messages: defineTable({
    applicationId: v.id("applications"),
    author: v.string(),
    role: v.string(),
    body: v.string(),
    createdAt: v.string(),
  }).index("by_application", ["applicationId"]),
  timeline: defineTable({
    applicationId: v.id("applications"),
    status: v.string(),
    note: v.string(),
    createdAt: v.string(),
  }).index("by_application", ["applicationId"]),
  guideLogs: defineTable({
    applicationId: v.id("applications"),
    mode: v.string(),
    question: v.optional(v.string()),
    source: v.string(),
    lines: v.array(v.string()),
    createdAt: v.string(),
  }).index("by_application", ["applicationId"]),
});
