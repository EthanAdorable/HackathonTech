import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EventStatus } from "@/lib/tams-data";

type WorkflowRequest = {
  action: "addMessage" | "updateStatus" | "requestRevision" | "resubmit" | "approve" | "reject" | "addEndorsement";
  applicationId: string;
  author?: string;
  role?: string;
  body?: string;
  status?: string;
  note?: string;
};

async function listApplications(client: ConvexHttpClient) {
  return await client.query(api.applications.listWithDetails, {});
}

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ source: "local", applications: [] });
  }

  try {
    const payload = (await request.json()) as WorkflowRequest;
    const client = new ConvexHttpClient(convexUrl);
    const applicationId = payload.applicationId as Id<"applications">;

    if (payload.action === "addMessage") {
      await client.mutation(api.applications.addMessage, {
        applicationId,
        author: payload.author ?? "TAMS Hub",
        role: payload.role ?? "Student Officer",
        body: payload.body ?? "",
      });
    } else if (payload.action === "updateStatus") {
      await client.mutation(api.applications.updateStatus, {
        applicationId,
        status: payload.status as EventStatus,
        note: payload.note ?? "Status updated in TAMS Hub.",
      });
    } else if (payload.action === "requestRevision") {
      await client.mutation(api.applications.requestRevision, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body ?? "",
      });
    } else if (payload.action === "resubmit") {
      await client.mutation(api.applications.resubmit, {
        applicationId,
        note: payload.note,
      });
    } else if (payload.action === "approve") {
      await client.mutation(api.applications.approve, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body,
      });
    } else if (payload.action === "reject") {
      await client.mutation(api.applications.reject, {
        applicationId,
        author: payload.author ?? "SADU Associate",
        role: payload.role ?? "SADU Associate",
        body: payload.body,
      });
    } else if (payload.action === "addEndorsement") {
      await client.mutation(api.applications.addEndorsement, {
        applicationId,
        author: payload.author ?? "Faculty Adviser",
        body: payload.body,
      });
    }

    return NextResponse.json({ source: "convex", applications: await listApplications(client) });
  } catch {
    return NextResponse.json({ source: "local", applications: [] });
  }
}
