import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
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

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "TAMS Access Prototype",
      credentials: {
        userId: { label: "User", type: "text" },
      },
      async authorize(credentials) {
        const user = users.find((item) => item.id === credentials?.userId);
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
