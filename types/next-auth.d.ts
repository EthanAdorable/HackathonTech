import type { Role } from "@/lib/tams-data";

declare module "next-auth" {
  interface User {
    role?: Role;
  }

  interface Session {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
  }
}
