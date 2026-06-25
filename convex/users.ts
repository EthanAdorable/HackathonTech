import { query } from "./_generated/server";

function withUiId(document: any) {
  return { id: document._id, ...document };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map(withUiId);
  },
});
