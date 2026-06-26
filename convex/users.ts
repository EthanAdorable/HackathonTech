import { query } from "./_generated/server";

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
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map(withUiId);
  },
});
