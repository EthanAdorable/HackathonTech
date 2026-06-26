import { mutation } from "./_generated/server";
import { seedApplications, users } from "../lib/tams-data";

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["guideLogs", "timeline", "messages", "templates", "applications", "users"] as const) {
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

      for (const template of application.templates) {
        await ctx.db.insert("templates", {
          applicationId,
          templateId: template.templateId,
          enabled: template.enabled,
          values: template.values,
        });
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
