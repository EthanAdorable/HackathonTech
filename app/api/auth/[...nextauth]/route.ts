import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { users } from "@/lib/tams-data";

const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "TAMS Access Prototype",
      credentials: {
        userId: { label: "User", type: "text" },
      },
      async authorize(credentials) {
        const user = users.find((item) => item.id === credentials?.userId);
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: `${user.id}@tams.local`,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
