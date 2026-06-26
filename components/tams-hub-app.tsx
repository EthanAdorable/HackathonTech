"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bot,
  Database,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Eye,
  ClipboardList,
  FileText,
  FilePlus2,
  Filter,
  KeyRound,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  SendHorizonal,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UploadCloud,
  UsersRound,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  type DemoUser,
  type EventApplication,
  type EventStatus,
  type Role,
  getApplicationCompletion,
  getTemplateCompletion,
  makeAiSummary,
  makeChecklist,
  makeRevisionDraft,
  seedApplications,
  templateDefinitions,
  users,
} from "@/lib/tams-data";
import { addMessage, transitionApplication } from "@/lib/workflow";

const storageKey = "tams-hub-prototype-state";
const defaultApplicationId = seedApplications.find((application) => application.status === "Revision Requested")?.id ?? seedApplications[0].id;

type ServiceStatus = {
  authReadyForDeploy: boolean;
  authWarnings: string[];
  convexConfigured: boolean;
  convexHost: string;
  convexProject: string;
  openAiConfigured: boolean;
  railwayConfigured: boolean;
  railwayEnvironment?: string;
  railwayProject: string;
  railwayProjectId: "set" | "missing";
  railwayProjectIdConfigured: boolean;
};

type ConvexApplicationsResponse = {
  source: "convex" | "local";
  applications: EventApplication[];
  createdApplicationId?: string;
};

type ConvexUsersResponse = {
  source: "convex" | "local";
  users: DemoUser[];
};

type GuideLog = {
  id: string;
  mode: GuideMode;
  question?: string;
  source: string;
  lines: string[];
  createdAt: string;
};

type GuideLogsResponse = {
  source: "convex" | "local";
  logs: GuideLog[];
};

type Section = "dashboard" | "file" | "applications" | "messages" | "guide";
type GuideMode = "checklist" | "missing" | "summary" | "revision" | "question";
type EditableEventDetail = Pick<EventApplication, "title" | "organization" | "eventType" | "venue" | "eventDate" | "expectedParticipants">;

const sectionItems: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutGrid size={18} /> },
  { id: "file", label: "File Event", icon: <FileText size={18} /> },
  { id: "applications", label: "My Applications", icon: <ClipboardList size={18} /> },
  { id: "messages", label: "Messages", icon: <MessageSquare size={18} /> },
  { id: "guide", label: "TAMS Guide", icon: <Sparkles size={18} /> },
];

const roleIcons: Record<Role, ReactNode> = {
  "Student Officer": <UsersRound size={16} />,
  "SADU Associate": <ShieldCheck size={16} />,
  "Faculty Adviser": <ClipboardCheck size={16} />,
  Admin: <Settings2 size={16} />,
};

const statusTone: Record<EventStatus, string> = {
  Draft: "neutral",
  "Template Completion": "gold",
  "AI Pre-check": "gold",
  "Submitted to SADU": "blue",
  "Under Review": "blue",
  "Revision Requested": "gold",
  Resubmitted: "blue",
  "SADU Approved": "green",
  Rejected: "red",
  Archived: "neutral",
};

const guideModeLabels: Record<GuideMode, string> = {
  checklist: "Requirement Checklist",
  missing: "Missing Fields",
  summary: "SADU Summary",
  revision: "Revision Draft",
  question: "Filing Answer",
};

export function TamsHubApp() {
  const [entered, setEntered] = useState(false);
  const [activeUserId, setActiveUserId] = useState("juan");
  const [section, setSection] = useState<Section>("dashboard");
  const [applications, setApplications] = useState<EventApplication[]>(seedApplications);
  const [selectedAppId, setSelectedAppId] = useState(defaultApplicationId);
  const [guideMode, setGuideMode] = useState<GuideMode>("checklist");
  const [guideQuestion, setGuideQuestion] = useState("What should be completed before SADU review?");
  const [guideOutput, setGuideOutput] = useState<string[]>([]);
  const [guideLogs, setGuideLogs] = useState<GuideLog[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [applicationSource, setApplicationSource] = useState<"convex" | "local">("local");
  const [roleUsers, setRoleUsers] = useState<DemoUser[]>(users);

  const activeUser = roleUsers.find((user) => user.id === activeUserId) ?? roleUsers[0] ?? users[0];
  const selectedApp = applications.find((application) => application.id === selectedAppId) ?? applications[0];
  const templateAvailability = useMemo(() => {
    return Object.fromEntries(
      templateDefinitions.map((template) => [
        template.id,
        applications.some((application) => application.templates.find((entry) => entry.templateId === template.id)?.enabled),
      ]),
    );
  }, [applications]);

  const loadConvexApplications = useCallback(async () => {
    const response = await fetch("/api/convex-applications");
    if (!response.ok) throw new Error("Convex applications route unavailable");
    const data = (await response.json()) as ConvexApplicationsResponse;
    return data.source === "convex" && data.applications.length ? data.applications : null;
  }, []);

  const loadConvexUsers = useCallback(async () => {
    const response = await fetch("/api/convex-users");
    if (!response.ok) throw new Error("Convex users route unavailable");
    const data = (await response.json()) as ConvexUsersResponse;
    return data.source === "convex" && data.users.length ? data.users : null;
  }, []);

  const loadGuideLogs = useCallback(async (applicationId: string) => {
    if (applicationSource !== "convex" || applicationId.startsWith("app-")) {
      setGuideLogs([]);
      return;
    }

    try {
      const response = await fetch(`/api/guide-logs?applicationId=${encodeURIComponent(applicationId)}`);
      if (!response.ok) throw new Error("Guide logs route unavailable");
      const data = (await response.json()) as GuideLogsResponse;
      setGuideLogs(data.source === "convex" ? data.logs.slice(-5).reverse() : []);
    } catch {
      setGuideLogs([]);
    }
  }, [applicationSource]);

  useEffect(() => {
    let active = true;

    async function hydrateData() {
      try {
        const convexUsers = await loadConvexUsers();
        if (active && convexUsers) {
          setRoleUsers(convexUsers);
          setActiveUserId((current) => (convexUsers.some((user) => user.id === current) ? current : convexUsers[0].id));
        }
      } catch {
        // Keep local prototype role users.
      }

      try {
        const convexApplications = await loadConvexApplications();
        if (active && convexApplications) {
          setApplications(convexApplications);
          setSelectedAppId(convexApplications.find((app) => app.status === "Revision Requested")?.id ?? convexApplications[0].id);
          setApplicationSource("convex");
          setHydrated(true);
          return;
        }
      } catch {
        // Fall back to local prototype state below.
      }

      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as EventApplication[];
          if (!active) return;
          setApplications(parsed);
          setSelectedAppId(parsed.find((app) => app.status === "Revision Requested")?.id ?? parsed[0]?.id ?? seedApplications[0].id);
          setApplicationSource("local");
        } catch {
          if (active) {
            setApplications(seedApplications);
            setApplicationSource("local");
          }
        }
      }
      if (active) setHydrated(true);
    }

    hydrateData();

    return () => {
      active = false;
    };
  }, [loadConvexApplications, loadConvexUsers]);

  useEffect(() => {
    if (hydrated && applicationSource === "local") {
      window.localStorage.setItem(storageKey, JSON.stringify(applications));
    }
  }, [applicationSource, applications, hydrated]);

  useEffect(() => {
    if (hydrated) void loadGuideLogs(selectedApp.id);
  }, [hydrated, loadGuideLogs, selectedApp.id]);

  const visibleApplications = useMemo(() => {
    if (activeUser.role === "Student Officer") {
      return applications.filter((application) => application.ownerId === activeUser.id);
    }
    if (activeUser.role === "Faculty Adviser") {
      return applications.filter((application) => application.adviserId === activeUser.id);
    }
    return applications;
  }, [activeUser, applications]);

  useEffect(() => {
    if (visibleApplications.length && !visibleApplications.some((application) => application.id === selectedAppId)) {
      setSelectedAppId(visibleApplications[0].id);
    }
  }, [selectedAppId, visibleApplications]);

  const completion = getApplicationCompletion(selectedApp);
  const queueCount = applications.filter((application) =>
    ["Submitted to SADU", "Resubmitted", "Under Review"].includes(application.status),
  ).length;

  function updateApplication(next: EventApplication) {
    setApplications((current) => current.map((application) => (application.id === next.id ? next : application)));
  }

  function applyRemoteApplications(nextApplications: EventApplication[], preferredApplicationId?: string) {
    if (!nextApplications.length) return;
    setApplications(nextApplications);
    setSelectedAppId((current) =>
      preferredApplicationId && nextApplications.some((application) => application.id === preferredApplicationId)
        ? preferredApplicationId
        : nextApplications.some((application) => application.id === current)
          ? current
          : nextApplications.find((application) => application.status === "Revision Requested")?.id ?? nextApplications[0].id,
    );
  }

  function isConvexApplicationId(id: string) {
    return !id.startsWith("app-");
  }

  async function postConvexWorkflow(payload: Record<string, unknown>) {
    const response = await fetch("/api/convex-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return (await response.json()) as ConvexApplicationsResponse;
  }

  async function syncConvexWorkflow(payload: Record<string, unknown>) {
    if (applicationSource !== "convex") return;
    if (!isConvexApplicationId(selectedApp.id)) return;
    try {
      const data = await postConvexWorkflow({ applicationId: selectedApp.id, ...payload });
      if (data?.source === "convex") applyRemoteApplications(data.applications);
    } catch {
      // Keep optimistic local prototype state if Convex sync is unavailable.
    }
  }

  async function syncConvexTemplate(templateId: string, values: Record<string, string>) {
    if (applicationSource !== "convex") return;
    const template = selectedApp.templates.find((item) => item.templateId === templateId);
    const templateDocumentId = template?.templateDocumentId ?? template?.id;
    if (!templateDocumentId) return;
    try {
      await postConvexWorkflow({ action: "updateTemplate", templateDocumentId, values });
    } catch {
      // Keep optimistic local prototype state if Convex sync is unavailable.
    }
  }

  async function syncConvexDetails(next: EditableEventDetail) {
    if (applicationSource !== "convex") return;
    if (!isConvexApplicationId(selectedApp.id)) return;
    try {
      await postConvexWorkflow({ action: "updateDetails", applicationId: selectedApp.id, ...next });
    } catch {
      // Keep optimistic local prototype state if Convex sync is unavailable.
    }
  }

  async function syncConvexCreate(next: EventApplication) {
    if (applicationSource !== "convex") return;
    try {
      const data = await postConvexWorkflow({
        action: "create",
        title: next.title,
        organization: next.organization,
        eventType: next.eventType,
        venue: next.venue,
        eventDate: next.eventDate,
        expectedParticipants: next.expectedParticipants,
        ownerId: next.ownerId,
        adviserId: next.adviserId,
        riskLevel: next.riskLevel,
        templates: next.templates,
      });
      if (data?.source === "convex") {
        const createdApplicationId = data.createdApplicationId;
        if (!createdApplicationId) {
          applyRemoteApplications(data.applications);
          return;
        }

        setApplications((current) => {
          const optimistic = current.find((application) => application.id === next.id) ?? next;
          const remote = data.applications.find((application) => application.id === createdApplicationId);
          const merged: EventApplication = {
            ...(remote ?? optimistic),
            ...optimistic,
            id: createdApplicationId,
            templates: (remote?.templates ?? optimistic.templates).map((remoteTemplate) => {
              const optimisticTemplate = optimistic.templates.find((template) => template.templateId === remoteTemplate.templateId);
              return optimisticTemplate
                ? { ...remoteTemplate, enabled: optimisticTemplate.enabled, values: optimisticTemplate.values }
                : remoteTemplate;
            }),
          };
          const remoteApplications = data.applications.map((application) =>
            application.id === createdApplicationId ? merged : application,
          );
          const localOnly = current.filter(
            (application) =>
              application.id !== next.id &&
              !remoteApplications.some((remoteApplication) => remoteApplication.id === application.id),
          );
          return [...localOnly, ...remoteApplications];
        });
        setSelectedAppId((current) => (current === next.id ? createdApplicationId : current));
      }
    } catch {
      // Keep the optimistic local draft if Convex creation is unavailable.
    }
  }

  async function syncConvexTemplateAvailability(templateId: string, enabled: boolean) {
    if (applicationSource !== "convex") return;
    try {
      const data = await postConvexWorkflow({ action: "updateTemplateAvailability", templateId, enabled });
      if (data?.source === "convex") applyRemoteApplications(data.applications);
    } catch {
      // Keep optimistic local prototype state if Convex sync is unavailable.
    }
  }

  async function resetDemoData() {
    window.localStorage.removeItem(storageKey);
    setGuideOutput([]);
    setMessageDraft("");
    if (applicationSource === "convex") {
      try {
        const data = await postConvexWorkflow({ action: "resetDemo" });
        if (data?.source === "convex" && data.applications.length) {
          applyRemoteApplications(data.applications);
          setApplicationSource("convex");
          setGuideLogs([]);
          return;
        }
      } catch {
        // Fall back to local seed data below when Convex is unavailable.
      }
    }
    setApplications(seedApplications);
    setSelectedAppId(defaultApplicationId);
    setApplicationSource("local");
  }

  function toggleTemplateAvailability(templateId: string) {
    const nextEnabled = !templateAvailability[templateId];
    setApplications((current) =>
      current.map((application) => ({
        ...application,
        templates: application.templates.map((template) =>
          template.templateId === templateId ? { ...template, enabled: nextEnabled } : template,
        ),
      })),
    );
    void syncConvexTemplateAvailability(templateId, nextEnabled);
  }

  function updateTemplateValue(templateId: string, fieldId: string, value: string) {
    setApplications((current) =>
      current.map((application) => {
        if (application.id !== selectedAppId) return application;
        return {
          ...application,
          status: application.status === "Draft" ? "Template Completion" : application.status,
          templates: application.templates.map((template) =>
            template.templateId === templateId ? { ...template, values: { ...template.values, [fieldId]: value } } : template,
          ),
        };
      }),
    );
    void syncConvexTemplate(templateId, { [fieldId]: value });
  }

  function updateApplicationDetails(updates: Partial<EditableEventDetail>) {
    const next: EventApplication = {
      ...selectedApp,
      ...updates,
      status: selectedApp.status === "Draft" ? "Template Completion" : selectedApp.status,
    };
    updateApplication(next);
    void syncConvexDetails({
      title: next.title,
      organization: next.organization,
      eventType: next.eventType,
      venue: next.venue,
      eventDate: next.eventDate,
      expectedParticipants: next.expectedParticipants,
    });
  }

  function createApplication() {
    const id = `app-${Date.now()}`;
    const next: EventApplication = {
      id,
      title: "New Campus Event",
      organization: activeUser.organization ?? "Junior Philippine Computer Society",
      eventType: "Workshop",
      venue: "FEU Alabang Auditorium",
      eventDate: "2026-09-01",
      expectedParticipants: 40,
      ownerId: activeUser.id,
      adviserId: "adviser",
      status: "Draft",
      riskLevel: "Low",
      templates: templateDefinitions.map((template) => ({ templateId: template.id, values: {}, enabled: templateAvailability[template.id] ?? true })),
      messages: [],
      timeline: [
        {
          id: `timeline-${Date.now()}`,
          status: "Draft",
          note: "Application created in TAMS Events.",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    setApplications((current) => [next, ...current]);
    setSelectedAppId(id);
    setSection("file");
    void syncConvexCreate(next);
  }

  function setStatus(status: EventStatus, note: string) {
    updateApplication(transitionApplication(selectedApp, status, note));
    void syncConvexWorkflow({ action: "updateStatus", status, note });
  }

  function runComplianceCheck() {
    const currentCompletion = getApplicationCompletion(selectedApp);
    setGuideOutput([
      "Application has been checked.",
      currentCompletion.missing.length
        ? "Demo compliance check completed successfully. Required prototype fields can still be completed before submission."
        : "Demo compliance check completed successfully. Required prototype fields are complete.",
    ]);
    if (selectedApp.status === "Revision Requested") {
      updateApplication(transitionApplication(selectedApp, "Revision Requested", "Demo compliance check completed for revision response."));
      return;
    }
    setStatus("AI Pre-check", "Demo compliance check completed.");
  }

  function resubmitApplication() {
    const currentCompletion = getApplicationCompletion(selectedApp);
    if (currentCompletion.missing.length) {
      setGuideOutput([
        "Revision upload paused until required prototype fields are complete.",
        ...currentCompletion.missing.slice(0, 4),
      ]);
      setSection("file");
      return;
    }
    updateApplication(transitionApplication(selectedApp, "Resubmitted", "Student resubmitted after revision."));
    void syncConvexWorkflow({ action: "resubmit", note: "Student resubmitted after revision." });
  }

  async function generateGuide() {
    const fallback = localGuideResponse(selectedApp, guideMode, guideQuestion);
    setGuideOutput(["Generating guidance..."]);
    try {
      const response = await fetch("/api/tams-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: guideMode, question: guideQuestion, application: selectedApp }),
      });
      if (!response.ok) throw new Error("Guide route unavailable");
      const data = (await response.json()) as { lines?: string[] };
      setGuideOutput(data.lines?.length ? data.lines : fallback);
      void loadGuideLogs(selectedApp.id);
    } catch {
      setGuideOutput(fallback);
    }
  }

  function sendMessage(body = messageDraft) {
    if (!body.trim()) return;
    updateApplication(addMessage(selectedApp, activeUser.name, activeUser.role, body.trim()));
    void syncConvexWorkflow({
      action: "addMessage",
      author: activeUser.name,
      role: activeUser.role,
      body: body.trim(),
    });
    setMessageDraft("");
  }

  function requestRevision() {
    const body = makeRevisionDraft(selectedApp);
    const withMessage = addMessage(selectedApp, activeUser.name, activeUser.role, body);
    updateApplication(transitionApplication(withMessage, "Revision Requested", "SADU requested revisions."));
    void syncConvexWorkflow({
      action: "requestRevision",
      author: activeUser.name,
      role: activeUser.role,
      body,
    });
  }

  function approveApplication() {
    const body = "Approved. Final decision recorded by SADU reviewer.";
    const withMessage = addMessage(selectedApp, activeUser.name, activeUser.role, body);
    updateApplication(transitionApplication(withMessage, "SADU Approved", "SADU approved the application."));
    void syncConvexWorkflow({
      action: "approve",
      author: activeUser.name,
      role: activeUser.role,
      body,
    });
  }

  function rejectApplication() {
    const body = "Rejected by SADU after human review. Please coordinate before filing again.";
    const withMessage = addMessage(selectedApp, activeUser.name, activeUser.role, body);
    updateApplication(transitionApplication(withMessage, "Rejected", "SADU rejected the application."));
    void syncConvexWorkflow({
      action: "reject",
      author: activeUser.name,
      role: activeUser.role,
      body,
    });
  }

  function endorseApplication() {
    const body = "Faculty adviser note: Reviewed for organization coordination. Endorsement placeholder recorded for SADU visibility.";
    updateApplication(
      addMessage(
        selectedApp,
        activeUser.name,
        activeUser.role,
        body,
      ),
    );
    void syncConvexWorkflow({
      action: "addEndorsement",
      author: activeUser.name,
      body,
    });
  }

  if (!entered) {
    return <AccessScreen users={roleUsers} activeUserId={activeUserId} setActiveUserId={setActiveUserId} onEnter={() => setEntered(true)} />;
  }

  return (
    <main className="app-shell">
      <Sidebar activeUser={activeUser} activeSection={section} setSection={setSection} onSignOut={() => setEntered(false)} />

      <section className="workspace">
        <Topbar
          title={sectionTitle(section)}
          activeUser={activeUser}
          applications={visibleApplications}
          onNewEvent={createApplication}
          showNewEvent={activeUser.role === "Student Officer"}
        />

        {section === "dashboard" && (
          <DashboardView
            activeUser={activeUser}
            users={roleUsers}
            applications={visibleApplications}
            queueCount={queueCount}
            onResetDemo={resetDemoData}
            templateAvailability={templateAvailability}
            onToggleTemplate={toggleTemplateAvailability}
            onSelect={(id) => {
              setSelectedAppId(id);
              setSection("applications");
            }}
          />
        )}

        {section === "file" && (
          <FileEventView
            application={selectedApp}
            activeUser={activeUser}
            completionPercent={completion.percent}
            guideOutput={guideOutput}
            onApplicationChange={updateApplicationDetails}
            onTemplateChange={updateTemplateValue}
            onPrecheck={runComplianceCheck}
            onSubmit={() => setStatus("Submitted to SADU", "Student submitted the application to SADU.")}
            onResubmit={resubmitApplication}
          />
        )}

        {section === "applications" && (
          <ApplicationsView
            application={selectedApp}
            applications={visibleApplications}
            activeUser={activeUser}
            completionPercent={completion.percent}
            messageDraft={messageDraft}
            setMessageDraft={setMessageDraft}
            onSelect={setSelectedAppId}
            onReview={() => setStatus("Under Review", "SADU opened the application for review.")}
            onRevision={requestRevision}
            onResubmit={resubmitApplication}
            onApprove={approveApplication}
            onReject={rejectApplication}
            onEndorse={endorseApplication}
            onSend={() => sendMessage()}
          />
        )}

        {section === "messages" && (
          <MessagesView
            application={selectedApp}
            applications={visibleApplications}
            activeUser={activeUser}
            messageDraft={messageDraft}
            setMessageDraft={setMessageDraft}
            onSelect={setSelectedAppId}
            onSend={() => sendMessage()}
          />
        )}

        {section === "guide" && (
          <GuideView
            application={selectedApp}
            guideMode={guideMode}
            setGuideMode={setGuideMode}
            guideQuestion={guideQuestion}
            setGuideQuestion={setGuideQuestion}
            guideOutput={guideOutput}
            guideLogs={guideLogs}
            onGenerateGuide={generateGuide}
          />
        )}
      </section>
    </main>
  );
}

function AccessScreen({
  users,
  activeUserId,
  setActiveUserId,
  onEnter,
}: {
  users: DemoUser[];
  activeUserId: string;
  setActiveUserId: (id: string) => void;
  onEnter: () => void;
}) {
  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0];
  const [accessStep, setAccessStep] = useState<"login" | "otp" | "card">("login");
  const otpDigits = ["", "", "", "", "", ""];

  return (
    <main className="access-shell">
      <section className="access-hero">
        <div className="brand wide">
          <MascotLogo />
          <strong>TAMS Hub</strong>
        </div>
        <h1>
          Smarter campus workflows for <span>FEU organizations.</span>
        </h1>
        <p>TAMS Hub helps FEU Alabang student organizations submit event requirements, track SADU approvals, and collaborate in one secure platform.</p>
        <div className="hero-metrics">
          <Metric value="48" label="Active Organizations" />
          <Metric value="213" label="Events Filed This Sem" />
          <Metric value="91%" label="Approval Rate" />
          <Metric value="2.3 days" label="Avg. Review Time" />
        </div>
      </section>

      <section className="access-panel-wrap">
        <div className="access-heading">
          <MascotLogo />
          <div>
            <h2>Access TAMS Hub</h2>
            <p>Secure AI-assisted campus workflow platform</p>
          </div>
        </div>

        {accessStep === "login" && (
          <>
            <div className="access-login-card">
              <p className="label">FEU account login</p>
              <input value="student@feualabang.edu.ph" readOnly aria-label="FEU email" />
              <input value="Password" readOnly aria-label="Password" type="password" />
              <button className="primary-button full" onClick={() => setAccessStep("otp")}>Continue with FEU Account</button>
            </div>

            <button className="access-method" onClick={() => setAccessStep("card")}><CreditCard size={18} /><div><strong>Tap TAMS ID Card</strong><span>Hold your campus card near the reader</span></div></button>
            <button className="access-method" onClick={() => setAccessStep("otp")}><Smartphone size={18} /><div><strong>OTP Verification</strong><span>Receive a one-time code via SMS or email</span></div></button>

            <div className="access-login-card">
              <p className="label">Preview as role</p>
              <div className="role-choice-grid">
                {users.map((user) => (
                  <button
                    key={user.id}
                    className={user.id === activeUserId ? "role-chip active" : "role-chip"}
                    aria-pressed={user.id === activeUserId}
                    onClick={() => setActiveUserId(user.id)}
                  >
                    {roleIcons[user.role]}
                    {roleDisplayName(user.role)}
                  </button>
                ))}
              </div>
              <button className="gold-button full" onClick={onEnter}>Enter as {roleDisplayName(activeUser.role)}</button>
            </div>
          </>
        )}

        {accessStep === "otp" && (
          <div className="access-login-card verification-card">
            <div className="verification-title"><KeyRound size={18} /><div><strong>OTP Verification</strong><span>Enter the 6-digit code sent to ju***@feualabang.edu.ph</span></div></div>
            <div className="otp-grid">
              {otpDigits.map((digit, index) => <input key={index} value={digit} aria-label={`OTP digit ${index + 1}`} readOnly />)}
            </div>
            <button className="primary-button full" onClick={onEnter}>Verify & Enter</button>
            <button className="link-button" onClick={() => setAccessStep("login")}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          </div>
        )}

        {accessStep === "card" && (
          <div className="access-login-card verification-card">
            <div className="card-reader">
              <CreditCard size={28} />
              <span />
            </div>
            <div className="verification-title centered"><strong>Tap TAMS ID Card</strong><span>Hold your campus card near the reader to verify your campus role.</span></div>
            <button className="primary-button full" onClick={onEnter}>Simulate Card Tap</button>
            <button className="link-button" onClick={() => setAccessStep("login")}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          </div>
        )}

        <p className="secure-note"><KeyRound size={14} /> Access is based on verified campus role.</p>
      </section>
    </main>
  );
}

function Sidebar({
  activeUser,
  activeSection,
  setSection,
  onSignOut,
}: {
  activeUser: DemoUser;
  activeSection: Section;
  setSection: (section: Section) => void;
  onSignOut: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <MascotLogo />
        <div><strong>TAMS Hub</strong><span>FEU Campus Workflow</span></div>
      </div>
      <div className="logged-card"><span>Logged in as</span><strong>{roleDisplayName(activeUser.role)}</strong></div>
      <nav className="nav-list" aria-label="Main navigation">
        {sectionItems.map((item) => (
          <button
            key={item.id}
            className={item.id === activeSection ? "nav-button active" : "nav-button"}
            aria-current={item.id === activeSection ? "page" : undefined}
            onClick={() => setSection(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <button className="signout-button" onClick={onSignOut}><LogOut size={18} /> Sign Out</button>
    </aside>
  );
}

function Topbar({
  title,
  activeUser,
  applications,
  onNewEvent,
  showNewEvent,
}: {
  title: string;
  activeUser: DemoUser;
  applications: EventApplication[];
  onNewEvent: () => void;
  showNewEvent: boolean;
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const revisionApplication = applications.find((item) => item.status === "Revision Requested");
  const revisionCompletion = revisionApplication ? getApplicationCompletion(revisionApplication) : null;
  const revisionNotification = revisionApplication
    ? revisionCompletion?.missing.length
      ? `${revisionApplication.title} needs ${revisionCompletion.missing[0]} before resubmission.`
      : `${revisionApplication.title} has a SADU revision request ready for response.`
    : "";
  const draftCount = applications.filter((item) => item.status === "Draft" || item.status === "Template Completion").length;
  const notificationItems = [
    revisionNotification,
    draftCount ? `${draftCount} application${draftCount === 1 ? "" : "s"} still need template completion.` : "",
    serviceStatus && !serviceStatus.railwayProjectIdConfigured ? "Railway is waiting for login and a dedicated project ID." : "",
    serviceStatus?.authWarnings.length ? `Auth safety review: ${serviceStatus.authWarnings.join(", ")}.` : "",
    serviceStatus && !serviceStatus.openAiConfigured ? "TAMS Guide is using mock guidance until OPENAI_API_KEY is set." : "",
  ].filter(Boolean);

  useEffect(() => {
    let active = true;
    fetch("/api/service-status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ServiceStatus | null) => {
        if (active) setServiceStatus(data);
      })
      .catch(() => {
        if (active) setServiceStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="topbar">
      <h1>{title}</h1>
      <div className="top-actions">
        <div className="notification-wrap">
          <button
            className="notification-button"
            aria-label="View notifications"
            aria-expanded={notificationsOpen}
            aria-controls={notificationsOpen ? "notification-popover" : undefined}
            onClick={() => setNotificationsOpen((current) => !current)}
          >
            <Bell size={18} aria-hidden="true" />
            {notificationItems.length > 0 && <span className="notification-dot" aria-hidden="true" />}
          </button>
          {notificationsOpen && (
            <div className="notification-popover" id="notification-popover" role="region" aria-label="Notifications">
              <strong>Notifications</strong>
              {notificationItems.length ? notificationItems.map((item) => <span key={item}>{item}</span>) : <span>No active alerts.</span>}
            </div>
          )}
        </div>
        <div className="topbar-identity">
          <div className="avatar">{activeUser.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
          <strong>{activeUser.name}</strong>
          <span className="role-badge">{roleDisplayName(activeUser.role)}</span>
        </div>
        {showNewEvent && <button className="primary-button" onClick={onNewEvent}><Plus size={18} /> File New Event</button>}
      </div>
    </header>
  );
}

function DashboardView({
  activeUser,
  users: roleUsers,
  applications,
  queueCount,
  onResetDemo,
  templateAvailability,
  onToggleTemplate,
  onSelect,
}: {
  activeUser: DemoUser;
  users: DemoUser[];
  applications: EventApplication[];
  queueCount: number;
  onResetDemo: () => void;
  templateAvailability: Record<string, boolean>;
  onToggleTemplate: (templateId: string) => void;
  onSelect: (id: string) => void;
}) {
  const stats = getDashboardStats(activeUser.role, applications, queueCount);
  const [onlyActionItems, setOnlyActionItems] = useState(false);
  const revisionApplication = applications.find((app) => app.status === "Revision Requested");
  const revisionCompletion = revisionApplication ? getApplicationCompletion(revisionApplication) : null;
  const revisionAlertText = revisionApplication
    ? revisionCompletion?.missing.length
      ? `${revisionApplication.title} needs revisions for ${revisionCompletion.missing.slice(0, 2).join("; ")}.`
      : `${revisionApplication.title} has SADU revision notes waiting for response.`
    : "";
  const dashboardDate = formatDashboardDate(applications);
  const displayedApplications = onlyActionItems
    ? applications.filter((app) => app.status === "Revision Requested" || app.status === "Draft" || app.status === "Submitted to SADU")
    : applications;

  return (
    <div className="screen-stack">
      <div className="dashboard-welcome">
        <div>
          <h2>Welcome, FEU Alabang {roleWelcomeName(activeUser.role)}</h2>
          <p>{dashboardDate} - Semester 2, A.Y. 2024-2025</p>
        </div>
      </div>

      <section className="stats-grid">
        <StatCard icon={<Clock3 />} value={stats.pending} label="Pending Applications" tone="gold" />
        <StatCard icon={<AlertTriangle />} value={stats.needsAction} label="Needs Action" tone="red" />
        <StatCard icon={<CheckCircle2 />} value={stats.approved} label="Approved Events" tone="green" />
        <StatCard icon={<MessageSquare />} value={stats.messages} label="SADU Messages" tone="blue" />
      </section>

      {revisionApplication && (
        <section className="guide-alert">
          <Sparkles size={18} />
          <div><strong>TAMS Guide Alert</strong><p>{revisionAlertText}</p></div>
          <button className="gold-button" onClick={() => onSelect(revisionApplication.id)}><Eye size={15} /> View</button>
        </section>
      )}

      {activeUser.role === "Admin" && <ServiceReadinessPanel onResetDemo={onResetDemo} />}
      {activeUser.role === "Admin" && <AdminOperationsPanel users={roleUsers} templateAvailability={templateAvailability} onToggleTemplate={onToggleTemplate} />}

      <section className="table-card">
        <div className="table-header">
          <h2>Recent Applications</h2>
          <div>
            <button className={onlyActionItems ? "ghost-button active" : "ghost-button"} aria-pressed={onlyActionItems} onClick={() => setOnlyActionItems((current) => !current)}><Filter size={15} /> {onlyActionItems ? "Needs Action" : "Filter"}</button>
            <button className="ghost-button" disabled={!onlyActionItems} onClick={() => setOnlyActionItems(false)}><Eye size={15} /> View All</button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Event Name</th><th>Event Type</th><th>Submitted</th><th>Status</th><th>Required Action</th></tr></thead>
            <tbody>
              {displayedApplications.map((app) => (
                <tr
                  key={app.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${app.title}`}
                  onClick={() => onSelect(app.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(app.id);
                    }
                  }}
                >
                  <td>{app.title}</td>
                  <td>{app.eventType}</td>
                  <td>{formatShortDate(getSubmittedDate(app))}</td>
                  <td><span className={`status-pill ${statusTone[app.status]}`}>{shortStatus(app.status)}</span></td>
                  <td className="action-text">{requiredActionLabel(app)}</td>
                </tr>
              ))}
              {!displayedApplications.length && (
                <tr>
                  <td colSpan={5} className="empty-row">No applications match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function getDashboardStats(role: Role, applications: EventApplication[], queueCount: number) {
  const pending = role === "Student Officer"
    ? applications.filter((app) => ["Submitted to SADU", "Under Review", "Resubmitted"].includes(app.status)).length
    : queueCount;
  const needsAction = applications.filter((app) =>
    ["Draft", "Template Completion", "AI Pre-check", "Revision Requested"].includes(app.status),
  ).length;

  return {
    pending,
    needsAction,
    approved: applications.filter((app) => app.status === "SADU Approved").length,
    messages: applications.reduce((sum, app) => sum + app.messages.length, 0),
  };
}

function getSubmittedDate(application: EventApplication) {
  return application.timeline.find((entry) => entry.status === "Submitted to SADU")?.createdAt ?? application.timeline[0]?.createdAt ?? application.eventDate;
}

function AdminOperationsPanel({
  users: roleUsers,
  templateAvailability,
  onToggleTemplate,
}: {
  users: DemoUser[];
  templateAvailability: Record<string, boolean>;
  onToggleTemplate: (templateId: string) => void;
}) {
  return (
    <section className="admin-grid">
      <article className="admin-card">
        <div className="admin-card-heading"><Settings2 size={18} /><div><strong>Template Availability</strong><p>Prototype controls for the required event filing templates.</p></div></div>
        <div className="admin-list">
          {templateDefinitions.map((template) => {
            const available = templateAvailability[template.id] ?? true;
            return (
              <div className="admin-row" key={template.id}>
                <div><strong>{template.name}</strong><span>{template.fields.filter((field) => field.required).length} required fields</span></div>
                <button
                  className={available ? "toggle-button active" : "toggle-button"}
                  aria-pressed={available}
                  onClick={() => onToggleTemplate(template.id)}
                >
                  {available ? "Available" : "Disabled"}
                </button>
              </div>
            );
          })}
        </div>
      </article>
      <article className="admin-card">
        <div className="admin-card-heading"><UsersRound size={18} /><div><strong>Users & Roles</strong><p>Demo accounts aligned with TAMS Access permissions.</p></div></div>
        <div className="admin-list">
          {roleUsers.map((user) => (
            <div className="admin-row" key={user.id}>
              <div><strong>{user.name}</strong><span>{user.title}</span></div>
              <span className="role-badge">{roleDisplayName(user.role)}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function ServiceReadinessPanel({ onResetDemo }: { onResetDemo: () => void }) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/service-status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ServiceStatus | null) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const convexReady = status?.convexConfigured ?? false;
  const authReady = status?.authReadyForDeploy ?? false;
  const railwayReady = status?.railwayConfigured ?? false;
  const railwayProjectReady = status?.railwayProjectIdConfigured ?? false;
  const openAiReady = status?.openAiConfigured ?? false;
  const convexProject = status?.convexProject ?? "tams-hub-prototype";
  const railwayProject = status?.railwayProject ?? "TAMS Hub";
  const convexHost = status?.convexHost || "not configured";
  const railwayProjectId = status?.railwayProjectId ?? "missing";
  const authWarnings = status?.authWarnings ?? [];

  return (
    <section className="service-grid">
      <article className="service-card">
        <span className={convexReady ? "service-icon ready" : "service-icon waiting"}><Database size={18} /></span>
        <div>
          <strong>Convex Project</strong>
          <p>{convexReady ? `Runtime URL configured for ${convexProject}.` : `Target project: ${convexProject}. Waiting for Convex deployment URL.`}</p>
          <span className="service-detail">Host: {convexHost}</span>
        </div>
        <span className={convexReady ? "status-pill green" : "status-pill gold"}>{convexReady ? "Ready" : "Waiting"}</span>
      </article>
      <article className="service-card">
        <span className={railwayReady && railwayProjectReady ? "service-icon ready" : "service-icon waiting"}><ShieldCheck size={18} /></span>
        <div>
          <strong>Railway Project</strong>
          <p>
            {railwayReady && railwayProjectReady
              ? `Running on ${railwayProject}${status?.railwayEnvironment ? ` (${status.railwayEnvironment})` : ""}.`
              : `Target project: ${railwayProject}. ${railwayProjectReady ? "Project ID is configured." : "Waiting for Railway login and project ID."}`}
          </p>
          <span className="service-detail">Project ID: {railwayProjectId}</span>
        </div>
        <span className={railwayReady && railwayProjectReady ? "status-pill green" : "status-pill gold"}>{railwayReady && railwayProjectReady ? "Ready" : "Waiting"}</span>
      </article>
      <article className="service-card">
        <span className={openAiReady ? "service-icon ready" : "service-icon waiting"}><Bot size={18} /></span>
        <div>
          <strong>OpenAI Guide</strong>
          <p>{openAiReady ? "OPENAI_API_KEY is configured for live guidance." : "Using deterministic mock guidance fallback."}</p>
        </div>
        <span className={openAiReady ? "status-pill green" : "status-pill neutral"}>{openAiReady ? "Live" : "Mock"}</span>
      </article>
      <article className="service-card">
        <span className={authReady ? "service-icon ready" : "service-icon waiting"}><KeyRound size={18} /></span>
        <div>
          <strong>Auth Safety</strong>
          <p>{authReady ? "Auth callback and demo access settings are deploy-ready." : "Local prototype auth settings need production values before Railway deploy."}</p>
          <span className="service-detail">Checks: {authWarnings.length ? authWarnings.join(", ") : "passed"}</span>
        </div>
        <span className={authReady ? "status-pill green" : "status-pill gold"}>{authReady ? "Ready" : "Review"}</span>
      </article>
      <article className="service-card">
        <span className="service-icon ready"><RotateCcw size={18} /></span>
        <div>
          <strong>Demo Data</strong>
          <p>Restore local prototype data after a review or revision demo.</p>
        </div>
        <button className="secondary-button" onClick={onResetDemo}><RotateCcw size={16} /> Reset</button>
      </article>
    </section>
  );
}

function FileEventView({
  application,
  activeUser,
  completionPercent,
  guideOutput,
  onApplicationChange,
  onTemplateChange,
  onPrecheck,
  onSubmit,
  onResubmit,
}: {
  application: EventApplication;
  activeUser: DemoUser;
  completionPercent: number;
  guideOutput: string[];
  onApplicationChange: (updates: Partial<EditableEventDetail>) => void;
  onTemplateChange: (templateId: string, fieldId: string, value: string) => void;
  onPrecheck: () => void;
  onSubmit: () => void;
  onResubmit: () => void;
}) {
  const mainTemplates = templateDefinitions.slice(0, 4);
  const guideLines = guideOutput.length ? guideOutput : localGuideResponse(application, "missing", "");
  const applicationCompletion = getApplicationCompletion(application);
  const missingCount = applicationCompletion.missing.length;
  const revisionAlert = application.status === "Revision Requested";
  const proposalValues = application.templates.find((template) => template.templateId === "proposal")?.values ?? {};
  const budgetValues = application.templates.find((template) => template.templateId === "budget")?.values ?? {};
  const revisionDetail = revisionAlert ? revisionGuideDetail(applicationCompletion.missing, application.messages) : "";
  const canEditDetails = activeUser.role === "Student Officer" && ["Draft", "Template Completion", "AI Pre-check", "Revision Requested"].includes(application.status);

  return (
    <section className="file-layout">
      <div className="form-column">
        <div className="section-heading"><h2>Submit Event Proposal</h2><p>Fill out all required fields and attach supporting documents.</p></div>
        <div className="panel">
          <h3>Event Information</h3>
          <div className="form-grid">
            <Field label="Event Title" wide><input value={application.title} readOnly={!canEditDetails} onChange={(event) => onApplicationChange({ title: event.target.value })} /></Field>
            <Field label="Organization"><input value={application.organization} readOnly={!canEditDetails} onChange={(event) => onApplicationChange({ organization: event.target.value })} /></Field>
            <Field label="Event Type"><input value={application.eventType} readOnly={!canEditDetails} onChange={(event) => onApplicationChange({ eventType: event.target.value })} /></Field>
            <Field label="Date & Time"><input type="date" value={application.eventDate} readOnly={!canEditDetails} onChange={(event) => onApplicationChange({ eventDate: event.target.value })} /></Field>
            <Field label="Venue"><input value={application.venue} readOnly={!canEditDetails} onChange={(event) => onApplicationChange({ venue: event.target.value })} /></Field>
            <Field label="Expected Participants"><input type="number" min="1" value={application.expectedParticipants} readOnly={!canEditDetails} onChange={(event) => onApplicationChange({ expectedParticipants: Math.max(1, Number(event.target.value) || 1) })} /></Field>
            <Field label="Adviser Name"><input value={activeUser.role === "Faculty Adviser" ? activeUser.name : "Prof. Maria Santos"} readOnly /></Field>
            <Field label="Budget Estimate (PHP)"><input value={formatBudgetEstimate(budgetValues.totalBudget)} readOnly /></Field>
            <Field label="Event Objectives" wide><textarea value={proposalValues.objectives ?? ""} readOnly placeholder={"Describe the purpose, goals, and expected outcomes of this event\u2026"} /></Field>
          </div>
        </div>

        <div className="panel">
          <h3>Upload Requirements</h3>
          <div className="requirement-grid">
            {mainTemplates.map((template) => {
              const status = getTemplateCompletion(application, template.id);
              const entry = application.templates.find((item) => item.templateId === template.id);
              const enabled = entry?.enabled ?? true;
              return (
                <div className="requirement-tile" key={template.id}>
                  <UploadCloud size={18} />
                  <div><strong>{template.name.replace(" Template", "")}</strong><span>{enabled ? (status.complete ? "Ready" : "Required") : "Unavailable"}</span></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <h3>Template Completion</h3>
          <div className="template-stack">
            {templateDefinitions.map((template) => {
              const entry = application.templates.find((item) => item.templateId === template.id);
              const enabled = entry?.enabled ?? true;
              const templateCompletion = getTemplateCompletion(application, template.id);
              return (
                <details key={template.id} className={enabled ? "template-card" : "template-card unavailable"} open={enabled && templateCompletion.missing.length > 0}>
                  <summary>
                    <span><strong>{template.name}</strong><small>{template.description}</small></span>
                    <span className={enabled ? (templateCompletion.complete ? "ready-tag" : "missing-tag") : "status-pill neutral"}>
                      {enabled ? `${templateCompletion.completed}/${templateCompletion.required || template.fields.length}` : "Unavailable"}
                    </span>
                  </summary>
                  <div className="field-grid">
                    {template.fields.map((field) => (
                      <label key={field.id} className="field">
                        <span>{field.label}{field.required ? " *" : ""}</span>
                        {field.type === "textarea" ? (
                          <textarea disabled={!enabled} value={entry?.values[field.id] ?? ""} onChange={(event) => onTemplateChange(template.id, field.id, event.target.value)} />
                        ) : field.type === "select" ? (
                          <select disabled={!enabled} value={entry?.values[field.id] ?? ""} onChange={(event) => onTemplateChange(template.id, field.id, event.target.value)}>
                            <option value="">Select</option>
                            {field.options?.map((option) => <option key={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input disabled={!enabled} type={field.type} value={entry?.values[field.id] ?? ""} onChange={(event) => onTemplateChange(template.id, field.id, event.target.value)} />
                        )}
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="guide-card">
        <div className="guide-card-title"><Sparkles size={18} /><strong>TAMS Guide</strong><span>AI Assistant</span></div>
        <p className="label">Suggested requirements</p>
        <ul className="guide-checklist">
          {templateDefinitions.slice(0, 6).map((template) => {
            const status = getTemplateCompletion(application, template.id);
            return <li key={template.id} className={status.complete ? "ok" : "missing"}>{template.name.replace(" Template", "")}</li>;
          })}
        </ul>
        {revisionAlert && <div className="warning-box" role="alert"><AlertTriangle size={16} /><div><strong>Revision Inconsistency</strong><p>{revisionDetail}</p></div></div>}
        <div className="warning-box amber" role="status" aria-live="polite"><CircleAlert size={16} /><div><strong>{missingCount || "No"} required document(s) missing</strong><p>{missingCount ? "Upload them to proceed with submission." : `${completionPercent}% of required prototype templates are complete.`}</p></div></div>
        <button className="gold-button full" onClick={onPrecheck}><Sparkles size={16} /> Run AI Completeness Check</button>
        <div className="guide-says" role="status" aria-live="polite"><strong>TAMS Guide says:</strong>{guideLines.map((line) => <p key={line}>{line}</p>)}</div>
        {revisionAlert ? (
          <button className="primary-button full" disabled={missingCount > 0} onClick={onResubmit}><UploadCloud size={16} /> Upload Revised Documents</button>
        ) : (
          <button className="primary-button full" disabled={completionPercent < 70} onClick={onSubmit}><SendHorizonal size={16} /> Submit to SADU</button>
        )}
      </aside>
    </section>
  );
}

function ApplicationsView({
  application,
  applications,
  activeUser,
  completionPercent,
  messageDraft,
  setMessageDraft,
  onSelect,
  onReview,
  onRevision,
  onResubmit,
  onApprove,
  onReject,
  onEndorse,
  onSend,
}: {
  application: EventApplication;
  applications: EventApplication[];
  activeUser: DemoUser;
  completionPercent: number;
  messageDraft: string;
  setMessageDraft: (value: string) => void;
  onSelect: (id: string) => void;
  onReview: () => void;
  onRevision: () => void;
  onResubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEndorse: () => void;
  onSend: () => void;
}) {
  const requiredActions = getRequiredActionCards(application);

  return (
    <div className="screen-stack">
      <div className="application-title-row">
        <div><h2>{application.title}</h2><p>Application ID: {application.id.toUpperCase()}{" \u00b7 "}{application.eventType}{" \u00b7 "}{application.organization}</p></div>
        <span className={`status-pill ${statusTone[application.status]}`}>{application.status}</span>
      </div>

      {activeUser.role === "SADU Associate" && <ReviewerInsightsPanel application={application} completionPercent={completionPercent} />}

      <section className="status-card">
        <div className="status-header"><strong>Application Progress</strong><span>{completionPercent}%</span></div>
        <div className="progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
        <div className="progress-steps">
          {getProgressMilestones(application).map((milestone) => {
            const className = ["progress-step", milestone.done ? "done" : "", milestone.active ? "active" : ""].filter(Boolean).join(" ");
            return <div key={milestone.label} className={className}><span>{milestone.done ? <CheckCircle2 size={13} /> : null}</span><strong>{milestone.label}</strong><small>{milestone.date ? formatMilestoneDate(milestone.date) : "-"}</small></div>;
          })}
        </div>
      </section>

      <section className="applications-layout">
        <div className="panel">
          <h3>Required Actions</h3>
          <div className="action-list">
            {requiredActions.map((item) => (
              <div className="required-action" key={item.title}><CircleAlert size={18} /><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>
            ))}
            {!requiredActions.length && <div className="required-action ok"><CheckCircle2 size={18} /><div><strong>No missing prototype fields</strong><p>Ready for human review.</p></div></div>}
          </div>
          <WorkflowActions role={activeUser.role} status={application.status} onReview={onReview} onRevision={onRevision} onResubmit={onResubmit} onApprove={onApprove} onReject={onReject} onEndorse={onEndorse} />
        </div>

        <div className="panel">
          <h3>Communication Thread</h3>
          <MiniThread application={application} activeRole={activeUser.role} />
          <div className="composer-row inline-composer">
            <input aria-label="Application thread message" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder={"Type a message to SADU\u2026"} />
            <button className="send-button" aria-label="Send Application Thread Message" onClick={onSend}><SendHorizonal size={18} aria-hidden="true" /></button>
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="table-header"><h2>All Visible Applications</h2></div>
        <div className="application-list compact">
          {applications.map((app) => (
            <button
              key={app.id}
              className={app.id === application.id ? "application-card active" : "application-card"}
              aria-pressed={app.id === application.id}
              onClick={() => onSelect(app.id)}
            >
              <div><strong>{app.title}</strong><span>{app.organization}</span></div>
              <span className={`status-pill ${statusTone[app.status]}`}>{shortStatus(app.status)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function getProgressMilestones(application: EventApplication) {
  const lookup = new Map(application.timeline.map((entry) => [entry.status, entry]));
  const finalEntry = lookup.get("SADU Approved") ?? lookup.get("Rejected") ?? lookup.get("Archived");
  const adviserEntry = application.messages.find((message) => message.role === "Faculty Adviser");

  return [
    { label: "Draft Created", done: true, active: application.status === "Draft", date: lookup.get("Draft")?.createdAt },
    { label: "Submitted to SADU", done: Boolean(lookup.get("Submitted to SADU") || lookup.get("Under Review") || lookup.get("Revision Requested") || lookup.get("Resubmitted") || finalEntry), active: application.status === "Submitted to SADU", date: lookup.get("Submitted to SADU")?.createdAt },
    { label: "Under Review", done: Boolean(lookup.get("Under Review") || lookup.get("Revision Requested") || lookup.get("Resubmitted") || finalEntry), active: application.status === "Under Review", date: lookup.get("Under Review")?.createdAt },
    { label: "Revision Requested", done: Boolean(lookup.get("Revision Requested") || lookup.get("Resubmitted") || finalEntry), active: application.status === "Revision Requested", date: lookup.get("Revision Requested")?.createdAt },
    { label: "Adviser Endorsement", done: Boolean(adviserEntry || finalEntry), active: false, date: adviserEntry?.createdAt },
    { label: "Final Approval", done: Boolean(finalEntry), active: application.status === "SADU Approved" || application.status === "Rejected" || application.status === "Archived", date: finalEntry?.createdAt },
  ];
}

function getRequiredActionCards(application: EventApplication) {
  const missingCards = getApplicationCompletion(application).missing.slice(0, 3).map((item) => {
    const [title, detail] = item.split(":");
    const actionTitle = application.status === "Revision Requested" ? `Revise ${title.replace(" Template", "")}` : title;
    return { title: actionTitle, detail: detail?.trim() || "Complete before proceeding." };
  });

  if (missingCards.length) return missingCards;

  if (application.status === "Revision Requested") {
    return [
      {
        title: "Respond to SADU revision notes",
        detail: "Review the communication thread and upload the requested clarification before resubmission.",
      },
    ];
  }

  return [];
}

function formatBudgetEstimate(value?: string) {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return "Not set";
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function revisionGuideDetail(missingItems: string[], messages: EventApplication["messages"]) {
  if (missingItems.length) {
    return `SADU flagged ${missingItems.slice(0, 2).join("; ")} before resubmission.`;
  }

  const latestRevision = [...messages]
    .reverse()
    .find((message) => message.role === "SADU Associate" && /revise|revision|clarify|resubmit/i.test(message.body));
  return latestRevision?.body ?? "Review the SADU thread and resolve the latest revision notes before resubmission.";
}

function ReviewerInsightsPanel({ application, completionPercent }: { application: EventApplication; completionPercent: number }) {
  const completion = getApplicationCompletion(application);

  return (
    <section className="reviewer-grid">
      <article className="reviewer-card">
        <div className="reviewer-heading"><Sparkles size={18} /><strong>AI Reviewer Summary</strong><span>Guidance only</span></div>
        <p>{makeAiSummary(application)}</p>
      </article>
      <article className="reviewer-card">
        <div className="reviewer-heading"><FilePlus2 size={18} /><strong>Template Readiness</strong><span>{completionPercent}%</span></div>
        <div className="template-mini-list">
          {templateDefinitions.map((template) => {
            const status = getTemplateCompletion(application, template.id);
            const entry = application.templates.find((item) => item.templateId === template.id);
            const enabled = entry?.enabled ?? true;
            return (
              <div key={template.id} className="template-mini-row">
                <span className={enabled && status.complete ? "mini-dot ready" : "mini-dot waiting"} />
                <strong>{template.name.replace(" Template", "")}</strong>
                <small>{enabled ? (status.complete ? "Ready" : `${status.missing.length} missing`) : "Unavailable"}</small>
              </div>
            );
          })}
        </div>
      </article>
      <article className="reviewer-card">
        <div className="reviewer-heading"><CircleAlert size={18} /><strong>Review Focus</strong><span>{completion.missing.length ? "Needs attention" : "Ready"}</span></div>
        <ul className="review-focus-list">
          {(completion.missing.length ? completion.missing.slice(0, 4) : ["Confirm final SADU decision and record reviewer notes."]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </article>
    </section>
  );
}

function MessagesView({
  application,
  applications,
  activeUser,
  messageDraft,
  setMessageDraft,
  onSelect,
  onSend,
}: {
  application: EventApplication;
  applications: EventApplication[];
  activeUser: DemoUser;
  messageDraft: string;
  setMessageDraft: (value: string) => void;
  onSelect: (id: string) => void;
  onSend: () => void;
}) {
  const [threadSearch, setThreadSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState(application.id);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const threads = applications.map((item) => {
    const latestMessage = item.messages.at(-1);
    return {
      id: item.id,
      title: item.title,
      preview: latestMessage?.body ?? `${shortStatus(item.status)} - no messages yet.`,
      count: item.messages.length ? String(item.messages.length) : "",
      time: latestMessage ? formatShortDate(latestMessage.createdAt) : shortStatus(item.status),
      application: item,
    };
  });
  const visibleThreads = threads.filter((thread) =>
    `${thread.title} ${thread.preview}`.toLowerCase().includes(threadSearch.trim().toLowerCase()),
  );
  const selectedThread =
    visibleThreads.find((thread) => thread.id === selectedThreadId) ??
    visibleThreads[0];

  useEffect(() => {
    setSelectedThreadId(application.id);
  }, [application.id]);

  return (
    <section className="messages-layout">
      <aside className="thread-list panel">
        <div className="search-box"><Search size={16} aria-hidden="true" /><input aria-label="Search messages" value={threadSearch} onChange={(event) => setThreadSearch(event.target.value)} placeholder={"Search messages\u2026"} /></div>
        {visibleThreads.map((thread) => (
          <button
            key={thread.id}
            className={thread.id === selectedThread.id ? "thread-item active" : "thread-item"}
            aria-pressed={thread.id === selectedThread.id}
            onClick={() => {
              setSelectedThreadId(thread.id);
              onSelect(thread.id);
            }}
          >
            <span className="thread-meta"><strong>{thread.title}</strong><span>{thread.count && <em>{thread.count}</em>}{thread.time}</span></span>
            <small>{thread.preview}</small>
          </button>
        ))}
        {!visibleThreads.length && <p className="empty-thread">No matching conversations.</p>}
      </aside>
      <section className="chat-panel panel">
        {selectedThread ? (
          <>
            <div className="message-thread-header">
              <h2>{selectedThread.title}</h2>
            </div>
            <MiniThread application={selectedThread.application} activeRole={activeUser.role} ownLabel="You" expanded />
            <div className="composer-row"><input aria-label="Message" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder={"Type a message\u2026"} /><button className="send-button" aria-label="Send Message" onClick={onSend}><SendHorizonal size={18} aria-hidden="true" /></button></div>
          </>
        ) : (
          <div className="empty-chat-state" role="status" aria-live="polite"><Search size={22} aria-hidden="true" /><strong>No conversation selected</strong><p>Clear the search to return to the collaboration thread.</p></div>
        )}
      </section>
      <section className="partner-card">
        <Sparkles size={18} />
        <div><strong>TAMS Guide - Suggested Partners</strong><p>This event may fit collaboration with Junior Philippine Computer Society and FEU Engineering Society.</p></div>
        {["Junior Philippine CS Society", "Student Council Federation", "FEU Engineering Society"].map((partner) => (
          <button
            type="button"
            className={selectedPartners.includes(partner) ? "partner-chip active" : "partner-chip"}
            aria-pressed={selectedPartners.includes(partner)}
            key={partner}
            onClick={() => setSelectedPartners((current) => (current.includes(partner) ? current.filter((item) => item !== partner) : [...current, partner]))}
          >
            <UsersRound size={14} />
            <span>{partner}</span>
            <Plus size={14} />
          </button>
        ))}
      </section>
    </section>
  );
}

function GuideView({
  application,
  guideMode,
  setGuideMode,
  guideQuestion,
  setGuideQuestion,
  guideOutput,
  guideLogs,
  onGenerateGuide,
}: {
  application: EventApplication;
  guideMode: GuideMode;
  setGuideMode: (mode: GuideMode) => void;
  guideQuestion: string;
  setGuideQuestion: (value: string) => void;
  guideOutput: string[];
  guideLogs: GuideLog[];
  onGenerateGuide: () => void;
}) {
  const lines = guideOutput.length ? guideOutput : localGuideResponse(application, "summary", guideQuestion);

  return (
    <div className="screen-stack guide-screen">
      <section className="guide-hero">
        <div><p className="guide-kicker"><ShieldCheck size={16} /> TAMS Hub Overview</p><h2>Streamlining FEU student organization workflows - from proposal to approval.</h2><p>TAMS Hub helps student organizations submit event requirements, track SADU approvals, communicate in one place, and reduce incomplete filings through TAMS Access and TAMS Guide.</p></div>
        <div className="guide-hero-mark">
          <ShieldCheck size={130} />
          <MascotLogo large />
        </div>
      </section>

      <section className="feature-grid">
        <Feature icon={<ShieldCheck />} title="TAMS Access" text="Multi-factor authentication with NFC card, OTP, and FEU SSO placeholders." />
        <Feature icon={<FilePlus2 />} title="Event Filing" text="Structured event proposal forms with AI-guided completeness checks." />
        <Feature icon={<Sparkles />} title="TAMS Guide" text="Summaries, missing field checks, revision drafts, and filing answers." />
        <Feature icon={<CalendarDays />} title="Real-Time Tracking" text="Visual timeline from draft to final SADU approval." />
        <Feature icon={<MessageSquare />} title="Collaboration Board" text="Direct communication between organizations, advisers, and SADU." />
        <Feature icon={<BadgeCheck />} title="SDG Alignment" text="Supports transparent campus workflows and student leadership." />
      </section>

      <section className="sdg-section">
        <div>
          <h2>SDG Alignment</h2>
          <p>TAMS Hub improves student leadership workflows, campus digital infrastructure, transparent approvals, and collaboration among FEU stakeholders.</p>
        </div>
        <div className="sdg-grid">
          <SdgCard number="4" label="Quality Education" tone="red" tag="Primary" />
          <SdgCard number="9" label="Industry, Innovation and Infrastructure" tone="orange" />
          <SdgCard number="16" label="Peace, Justice and Strong Institutions" tone="blue" />
          <SdgCard number="17" label="Partnerships for the Goals" tone="navy" />
        </div>
      </section>

      <section className="guide-workbench panel">
        <div className="guide-controls">
          <select aria-label="TAMS Guide mode" value={guideMode} onChange={(event) => setGuideMode(event.target.value as GuideMode)}>
            <option value="checklist">Requirement checklist</option>
            <option value="missing">Missing fields</option>
            <option value="summary">SADU summary</option>
            <option value="revision">Revision draft</option>
            <option value="question">Filing question</option>
          </select>
          {guideMode === "question" && (
            <textarea
              aria-label="TAMS Guide filing question"
              placeholder={"Ask about filing requirements, revisions, templates, or SADU review steps\u2026"}
              value={guideQuestion}
              onChange={(event) => setGuideQuestion(event.target.value)}
            />
          )}
          <button className="primary-button" onClick={onGenerateGuide}><Sparkles size={18} /> Generate Guidance</button>
        </div>
        <div className="guide-output" role="status" aria-live="polite">
          <div className="guide-output-header">
            <div>
              <span><Bot size={14} /> {guideModeLabels[guideMode]}</span>
              <strong>{application.title}</strong>
            </div>
            <small>Human review required</small>
          </div>
          <div className="guide-output-lines">
            {lines.map((line) => <p key={line}>{line}</p>)}
          </div>
        </div>
        <div className="guide-history" aria-label="TAMS Guide audit history">
          <div className="guide-history-heading"><Clock3 size={15} /><strong>Guidance history</strong><span>{guideLogs.length ? "Convex audit log" : "No saved runs yet"}</span></div>
          {guideLogs.length ? (
            guideLogs.map((log) => (
              <article key={log.id} className="guide-history-item">
                <span>{guideModeLabels[log.mode] ?? log.mode} - {log.source}</span>
                <strong>{log.lines[0] ?? "Guidance recorded."}</strong>
                <small>{formatShortDate(log.createdAt)}</small>
              </article>
            ))
          ) : (
            <p className="guide-history-empty">Generate guidance for a Convex-backed application to record a review trail.</p>
          )}
        </div>
        <p className="fine-print">AI guidance only. Final approval decisions remain with SADU and human reviewers.</p>
      </section>
    </div>
  );
}

function WorkflowActions({
  role,
  status,
  onReview,
  onRevision,
  onResubmit,
  onApprove,
  onReject,
  onEndorse,
}: {
  role: Role;
  status: EventStatus;
  onReview: () => void;
  onRevision: () => void;
  onResubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEndorse: () => void;
}) {
  if (role === "SADU Associate") {
    const canStartReview = status === "Submitted to SADU" || status === "Resubmitted";
    const canDecide = status === "Under Review";
    return (
      <div className="action-stack">
        <div className="action-row">
          <button className="secondary-button" disabled={!canStartReview} onClick={onReview}><Clock3 size={16} /> Mark Under Review</button>
          <button className="gold-button" disabled={!canDecide} onClick={onRevision}><AlertTriangle size={16} /> Request Revision</button>
          <button className="danger-button" disabled={!canDecide} onClick={onReject}><CircleAlert size={16} /> Reject</button>
          <button className="primary-button" disabled={!canDecide} onClick={onApprove}><CheckCircle2 size={16} /> Approve</button>
        </div>
        {!canDecide && <p className="fine-print">SADU actions unlock after the application is submitted or resubmitted.</p>}
      </div>
    );
  }
  if (role === "Student Officer" && status === "Revision Requested") {
    return <button className="primary-button full" onClick={onResubmit}><UploadCloud size={16} /> Upload Revised Documents</button>;
  }
  if (role === "Faculty Adviser") {
    return <button className="primary-button full" onClick={onEndorse}><ClipboardCheck size={16} /> Add Endorsement Note</button>;
  }
  return <p className="fine-print">Actions shown here depend on the verified TAMS Access role.</p>;
}

function MiniThread({ application, activeRole, ownLabel, expanded = false }: { application: EventApplication; activeRole: Role; ownLabel?: string; expanded?: boolean }) {
  const messages = application.messages.length ? application.messages : [{ id: "empty", author: "TAMS Hub", role: "SADU Associate" as Role, body: "No messages yet.", createdAt: new Date().toISOString() }];
  return (
    <div className={expanded ? "chat-thread expanded" : "chat-thread"}>
      {messages.map((message) => {
        const isOwnMessage = message.role === activeRole;
        return (
          <div key={message.id} className={isOwnMessage ? "chat-bubble own" : "chat-bubble"}>
            <strong>{isOwnMessage && ownLabel ? ownLabel : message.author}</strong>
            <p>{message.body}</p>
            <span>{formatShortDate(message.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MascotLogo({ large = false }: { large?: boolean }) {
  return (
    <div className={large ? "mascot-logo large" : "mascot-logo"} aria-label="TAMS Hub mascot">
      <Image src="/tams-mascot.svg" alt="" width={large ? 156 : 43} height={large ? 156 : 43} priority={large} />
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="hero-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function StatCard({ icon, value, label, tone }: { icon: ReactNode; value: number | string; label: string; tone: string }) {
  return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><strong>{value}</strong><p>{label}</p></div>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article className="feature-card"><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>;
}

function SdgCard({ number, label, tone, tag }: { number: string; label: string; tone: string; tag?: string }) {
  return (
    <article className="sdg-card">
      <span className={`sdg-number ${tone}`}>{number}</span>
      <strong>{label}</strong>
      {tag && <small>{tag}</small>}
    </article>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>;
}

function localGuideResponse(application: EventApplication, mode: GuideMode, question: string) {
  if (mode === "checklist") return makeChecklist(application);
  if (mode === "missing") {
    const missing = getApplicationCompletion(application).missing;
    return missing.length ? missing : ["All required prototype fields are complete."];
  }
  if (mode === "revision") return [makeRevisionDraft(application)];
  if (mode === "question") {
    return [
      `Question: ${question}`,
      "Complete required templates, run the TAMS Guide pre-check, keep adviser and SADU messages in the thread, and wait for SADU's human decision.",
    ];
  }
  return [makeAiSummary(application)];
}

function sectionTitle(section: Section) {
  if (section === "file") return "File New Event";
  if (section === "applications") return "Application Status";
  if (section === "messages") return "Messages & Collaboration";
  if (section === "guide") return "TAMS Guide & Overview";
  return "Dashboard";
}

function roleDisplayName(role: Role) {
  if (role === "Student Officer") return "Student Org Officer";
  if (role === "Faculty Adviser") return "Organization Adviser";
  if (role === "Admin") return "Campus Administrator";
  return role;
}

function roleWelcomeName(role: Role) {
  if (role === "Student Officer") return "Student Council Officer";
  return roleDisplayName(role);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDashboardDate(applications: EventApplication[]) {
  const latestTimelineDate = applications
    .flatMap((application) => application.timeline.map((entry) => entry.createdAt))
    .sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0];
  const date = latestTimelineDate ? new Date(latestTimelineDate) : new Date();
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function formatMilestoneDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function shortStatus(status: EventStatus) {
  if (status === "Revision Requested") return "Needs Revision";
  if (status === "Submitted to SADU" || status === "Under Review" || status === "Resubmitted") return "For Review";
  if (status === "SADU Approved") return "Approved";
  return status;
}

function requiredActionLabel(application: EventApplication) {
  if (application.status === "Revision Requested") {
    const firstMissingTemplate = getApplicationCompletion(application).missing[0]?.split(":")[0]?.replace(" Template", "");
    return firstMissingTemplate ? `Revise ${firstMissingTemplate}` : "Respond to SADU";
  }
  if (application.status === "Draft" || application.status === "Template Completion") return "Complete form";
  if (application.status === "AI Pre-check") return "Submit to SADU";
  if (application.status === "Submitted to SADU" || application.status === "Under Review" || application.status === "Resubmitted") return "Awaiting SADU";
  return "-";
}
