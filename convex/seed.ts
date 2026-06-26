import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { seedApplications, templateDefinitions, users } from "../lib/tams-data";

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

export const seedDemoData = mutation({
  args: {
    actor,
  },
  handler: async (ctx, args) => {
    if (args.actor.role !== "Admin") {
      throw new Error("Only admins can reset demo data.");
    }

    for (const table of [
      "compiledVerificationSummaries",
      "verificationResults",
      "extractionRuns",
      "uploadedDocuments",
      "guideLogs",
      "timeline",
      "messages",
      "attachments",
      "templateRequirements",
      "templates",
      "applications",
      "users",
    ] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }

    for (const user of users) {
      await ctx.db.insert("users", {
        name: user.name,
        role: user.role,
        organization: user.organization,
        title: user.title,
      });
    }

    for (const application of seedApplications) {
      const applicationId = await ctx.db.insert("applications", {
        title: application.title,
        organization: application.organization,
        eventType: application.eventType,
        venue: application.venue,
        eventDate: application.eventDate,
        expectedParticipants: application.expectedParticipants,
        ownerId: application.ownerId,
        adviserId: application.adviserId,
        status: application.status,
        riskLevel: application.riskLevel,
        adviserEndorsementRequired: application.adviserEndorsement.required,
        adviserEndorsementState: application.adviserEndorsement.state,
        adviserEndorsementActorId: application.adviserEndorsement.actorId,
        adviserEndorsementActorName: application.adviserEndorsement.actorName,
        adviserEndorsementActorRole: application.adviserEndorsement.actorRole,
        adviserEndorsementTimestamp: application.adviserEndorsement.timestamp,
        adviserEndorsementNotes: application.adviserEndorsement.notes,
      });

      for (const [index, template] of application.templates.entries()) {
        const templateDocumentId = await ctx.db.insert("templates", {
          applicationId,
          templateId: template.templateId,
          enabled: template.enabled,
          values: template.values,
        });
        const requirement = defaultRequirementForTemplate(template.templateId);
        if (requirement) {
          await ctx.db.insert("templateRequirements", {
            applicationId,
            templateDocumentId,
            templateId: template.templateId,
            requirementKey: requirement.requirementKey,
            label: requirement.label,
            description: requirement.description,
            required: requirement.required,
            visibleToReviewer: true,
            accepts: requirement.accepts,
            maxSizeBytes: 10 * 1024 * 1024,
            sortOrder: index,
          });
        }
      }

      for (const message of application.messages) {
        await ctx.db.insert("messages", {
          applicationId,
          author: message.author,
          role: message.role,
          body: message.body,
          createdAt: message.createdAt,
        });
      }

      for (const timeline of application.timeline) {
        await ctx.db.insert("timeline", {
          applicationId,
          status: timeline.status,
          note: timeline.note,
          createdAt: timeline.createdAt,
        });
      }
    }
  },
});

export const clearFiledData = mutation({
  args: {
    actor,
    deleteStoredFiles: v.optional(v.boolean()),
    createTemplateShell: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.actor.role !== "Admin") {
      throw new Error("Only admins can clear filed data.");
    }

    const storageIds = new Set<string>();
    for (const table of ["attachments", "uploadedDocuments"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        storageIds.add(row.storageId);
      }
    }

    const deletedRows: Record<string, number> = {};
    for (const table of [
      "compiledVerificationSummaries",
      "verificationResults",
      "extractionRuns",
      "uploadedDocuments",
      "guideLogs",
      "timeline",
      "messages",
      "attachments",
      "templateRequirements",
      "templates",
      "applications",
    ] as const) {
      const rows = await ctx.db.query(table).collect();
      deletedRows[table] = rows.length;
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }

    let deletedStoredFiles = 0;
    if (args.deleteStoredFiles !== false) {
      for (const storageId of storageIds) {
        await ctx.storage.delete(storageId);
        deletedStoredFiles += 1;
      }
    }

    const createdApplicationId = args.createTemplateShell === false ? null : await insertTestingTemplateShell(ctx);

    return {
      deletedRows,
      deletedStoredFiles,
      preservedTables: ["users"],
      createdApplicationId,
    };
  },
});

async function insertTestingTemplateShell(ctx: any) {
  const applicationId = await ctx.db.insert("applications", {
    title: "Fresh Testing Draft",
    organization: "Testing Organization",
    eventType: "Workshop",
    venue: "TBD",
    eventDate: new Date().toISOString().slice(0, 10),
    expectedParticipants: 40,
    ownerId: "juan",
    adviserId: "adviser",
    status: "Draft",
    riskLevel: "Low",
    adviserEndorsementRequired: false,
    adviserEndorsementState: "Not Required",
  });

  for (const [index, template] of templateDefinitions.entries()) {
    const templateDocumentId = await ctx.db.insert("templates", {
      applicationId,
      templateId: template.id,
      enabled: true,
      values: {},
    });
    const requirement = defaultRequirementForTemplate(template.id);
    if (requirement) {
      await ctx.db.insert("templateRequirements", {
        applicationId,
        templateDocumentId,
        templateId: template.id,
        requirementKey: requirement.requirementKey,
        label: requirement.label,
        description: requirement.description,
        required: requirement.required,
        visibleToReviewer: true,
        accepts: requirement.accepts,
        maxSizeBytes: 10 * 1024 * 1024,
        sortOrder: index,
      });
    }
  }

  return applicationId;
}

function defaultRequirementForTemplate(templateId: string) {
  const requirements: Record<
    string,
    {
      requirementKey: string;
      label: string;
      description: string;
      required: boolean;
      accepts: string[];
    }
  > = {
    app: {
      requirementKey: "completed-app",
      label: "APP FORM",
      description: "Activity / Program Proposal with event, schedule, venue, budget, and approval evidence.",
      required: true,
      accepts: ["application/pdf"],
    },
    apf: {
      requirementKey: "completed-apf",
      label: "APF FORM",
      description: "Activity Profile with programme, participants, budget, committees, and signatories.",
      required: true,
      accepts: ["application/pdf"],
    },
    verf: {
      requirementKey: "completed-verf",
      label: "VERF FORM",
      description: "Venue and Equipment Reservation Form as a PDF or scanned image.",
      required: true,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
    },
    publicity: {
      requirementKey: "publicity-publication-post",
      label: "Publicity Publication Post",
      description: "Final or draft publication materials for review.",
      required: false,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
    },
    speaker: {
      requirementKey: "speaker-guest-request",
      label: "Speaker guest request",
      description: "Invitation letter, confirmation, or equivalent coordination proof.",
      required: false,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
    },
  };

  return requirements[templateId];
}
