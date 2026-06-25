"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SessionProvider } from "next-auth/react";
import { useMemo, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convex = useMemo(() => {
    return convexUrl ? new ConvexReactClient(convexUrl) : null;
  }, [convexUrl]);

  if (!convex) {
    return <SessionProvider>{children}</SessionProvider>;
  }

  return (
    <SessionProvider>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </SessionProvider>
  );
}
