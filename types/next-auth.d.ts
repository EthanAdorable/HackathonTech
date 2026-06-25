import type { Role } from "@/lib/tams-data";

declare module "next-auth" {
  interface User {
    id: string;
    role?: Role;
    organization?: string;
    title?: string;
  }

  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: Role;
      organization?: string;
      title?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    organization?: string;
    title?: string;
  }
}
