import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/",
  },
});

export const config = {
  matcher: [
    "/api/convex-applications/:path*",
    "/api/convex-users/:path*",
    "/api/convex-workflow/:path*",
    "/api/document-verification/:path*",
    "/api/guide-logs/:path*",
    "/api/tams-guide/:path*",
  ],
};
