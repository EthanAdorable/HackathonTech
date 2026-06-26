import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { seedApplications, users } from "../lib/tams-data";

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
    proposal: {
      requirementKey: "signed-event-proposal",
      label: "Signed event proposal",
      description: "Final proposal endorsed by the organization officer and adviser.",
      required: true,
      accepts: ["application/pdf"],
    },
    budget: {
      requirementKey: "budget-breakdown",
      label: "Budget breakdown",
      description: "Line-item cost estimate, funding source, and procurement notes.",
      required: true,
      accepts: ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
    },
    venue: {
      requirementKey: "venue-request-form",
      label: "Venue request form",
      description: "Facilities or room reservation request for the preferred venue.",
      required: true,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
    },
    program: {
      requirementKey: "program-flow",
      label: "Program flow document",
      description: "Run of show with call times, segments, and assigned officers.",
      required: true,
      accepts: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    },
    publicity: {
      requirementKey: "publicity-materials",
      label: "Publicity materials",
      description: "Final or draft publication materials for review.",
      required: true,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
    },
    speaker: {
      requirementKey: "speaker-invitation",
      label: "Speaker invitation or confirmation",
      description: "Invitation letter, confirmation, or equivalent coordination proof.",
      required: false,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
    },
    postEvent: {
      requirementKey: "post-event-documentation",
      label: "Post-event documentation",
      description: "Attendance, photos, completion report, or outcome documentation.",
      required: false,
      accepts: ["application/pdf", "image/png", "image/jpeg"],
    },
  };

  return requirements[templateId];
}
