import { query } from "./_generated/server";
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

function accessIdForUser(document: any) {
  if (document.role === "Student Officer") return "juan";
  if (document.role === "SADU Associate") return "sadu";
  if (document.role === "Faculty Adviser") return "adviser";
  if (document.role === "Admin") return "admin";
  return document._id;
}

function withUiId(document: any) {
  return { ...document, id: accessIdForUser(document), userDocumentId: document._id };
}

export const list = query({
  args: {
    actor,
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const mapped = users.map(withUiId);
    if (args.actor.role !== "Admin") {
      return mapped.filter((user) => user.id === args.actor.id);
    }
    return mapped;
  },
});
