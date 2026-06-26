import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { AccessActor } from "@/lib/access-policy";
import type { Role } from "@/lib/tams-data";

const roles = new Set<Role>(["Student Officer", "SADU Associate", "Faculty Adviser", "Admin"]);

export async function getAccessActor(): Promise<AccessActor | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || !user.name || !user.role || !roles.has(user.role)) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    organization: user.organization,
    title: user.title,
  };
}
