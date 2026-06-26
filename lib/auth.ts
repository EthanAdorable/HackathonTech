import type { NextAuthOptions } from "next-auth";
import { ConvexHttpClient } from "convex/browser";
import CredentialsProvider from "next-auth/providers/credentials";
import { api } from "@/convex/_generated/api";
import { users, type DemoUser } from "@/lib/tams-data";

function toAuthUser(user: DemoUser) {
  return {
    id: user.id,
    name: user.name,
    email: `${user.id}@tams.local`,
    role: user.role,
    organization: user.organization,
    title: user.title,
  };
}

export function isDemoAuthEnabled() {
  return process.env.TAMS_DEMO_AUTH_ENABLED === "true";
}

async function loadAuthUsers() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return users;

  try {
    const client = new ConvexHttpClient(convexUrl);
    const adminActor = users.find((user) => user.role === "Admin") ?? users[0];
    const convexUsers = await client.query(api.users.list, { actor: adminActor });
    return convexUsers.length ? convexUsers : users;
  } catch {
    return users;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "TAMS Access Prototype",
      credentials: {
        userId: { label: "User", type: "text" },
      },
      async authorize(credentials) {
        if (!isDemoAuthEnabled()) return null;
        const authUsers = await loadAuthUsers();
        const user = authUsers.find((item) => item.id === credentials?.userId);
        if (!user) return null;
        return toAuthUser(user);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organization = user.organization;
        token.title = user.title;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.organization = token.organization;
        session.user.title = token.title;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};
