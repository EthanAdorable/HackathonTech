"use client";

import Image from "next/image";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Bot,
  Building2,
  Database,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FilePlus2,
  Filter,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
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
  UserRound,
  UsersRound,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
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

type ServiceStatus = {
  convexConfigured: boolean;
  openAiConfigured: boolean;
  railwayConfigured: boolean;
  railwayEnvironment?: string;
};

type Section = "dashboard" | "file" | "applications" | "messages" | "guide";
type GuideMode = "checklist" | "missing" | "summary" | "revision" | "question";

const sectionItems: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "file", label: "File Event", icon: <FilePlus2 size={18} /> },
  { id: "applications", label: "My Applications", icon: <FolderKanban size={18} /> },
  { id: "messages", label: "Messages", icon: <MessageSquare size={18} /> },
  { id: "guide", label: "TAMS Guide", icon: <Bot size={18} /> },
];

const roleIcons: Record<Role, ReactNode> = {
  "Student Officer": <UserRound size={16} />,
  "SADU Associate": <ShieldCheck size={16} />,
  "Faculty Adviser": <ClipboardCheck size={16} />,
  Admin: <Building2 size={16} />,
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

export function TamsHubApp() {
  const [entered, setEntered] = useState(false);
  const [activeUserId, setActiveUserId] = useState("juan");
  const [section, setSection] = useState<Section>("dashboard");
  const [applications, setApplications] = useState<EventApplication[]>(seedApplications);
  const [selectedAppId, setSelectedAppId] = useState(seedApplications[2].id);
  const [guideMode, setGuideMode] = useState<GuideMode>("checklist");
  const [guideQuestion, setGuideQuestion] = useState("What should be completed before SADU review?");
  const [guideOutput, setGuideOutput] = useState<string[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0];
  const selectedApp = applications.find((application) => application.id === selectedAppId) ?? applications[0];

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as EventApplication[];
        setApplications(parsed);
        setSelectedAppId(parsed.find((app) => app.status === "Revision Requested")?.id ?? parsed[0]?.id ?? seedApplications[0].id);
      } catch {
        setApplications(seedApplications);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(storageKey, JSON.stringify(applications));
    }
  }, [applications, hydrated]);

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

  function resetDemoData() {
    window.localStorage.removeItem(storageKey);
    setApplications(seedApplications);
    setSelectedAppId(seedApplications[2].id);
    setGuideOutput([]);
    setMessageDraft("");
  }

  function updateTemplateValue(templateId: string, fieldId: string, value: string) {
    updateApplication({
      ...selectedApp,
      status: selectedApp.status === "Draft" ? "Template Completion" : selectedApp.status,
      templates: selectedApp.templates.map((template) =>
        template.templateId === templateId ? { ...template, values: { ...template.values, [fieldId]: value } } : template,
      ),
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
      ownerId: "juan",
      adviserId: "adviser",
      status: "Draft",
      riskLevel: "Low",
      templates: templateDefinitions.map((template) => ({ templateId: template.id, values: {}, enabled: true })),
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
  }

  function setStatus(status: EventStatus, note: string) {
    updateApplication(transitionApplication(selectedApp, status, note));
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
    } catch {
      setGuideOutput(fallback);
    }
  }

  function sendMessage(body = messageDraft) {
    if (!body.trim()) return;
    updateApplication(addMessage(selectedApp, activeUser.name, activeUser.role, body.trim()));
    setMessageDraft("");
  }

  function requestRevision() {
    const body = makeRevisionDraft(selectedApp);
    const withMessage = addMessage(selectedApp, activeUser.name, activeUser.role, body);
    updateApplication(transitionApplication(withMessage, "Revision Requested", "SADU requested revisions."));
  }

  function approveApplication() {
    const withMessage = addMessage(selectedApp, activeUser.name, activeUser.role, "Approved. Final decision recorded by SADU reviewer.");
    updateApplication(transitionApplication(withMessage, "SADU Approved", "SADU approved the application."));
  }

  function rejectApplication() {
    const withMessage = addMessage(selectedApp, activeUser.name, activeUser.role, "Rejected by SADU after human review. Please coordinate before filing again.");
    updateApplication(transitionApplication(withMessage, "Rejected", "SADU rejected the application."));
  }

  if (!entered) {
    return <AccessScreen activeUserId={activeUserId} setActiveUserId={setActiveUserId} onEnter={() => setEntered(true)} />;
  }

  return (
    <main className="app-shell">
      <Sidebar activeUser={activeUser} activeSection={section} setSection={setSection} onSignOut={() => setEntered(false)} />

      <section className="workspace">
        <Topbar
          title={sectionTitle(section)}
          activeUser={activeUser}
          onNewEvent={createApplication}
          showNewEvent={activeUser.role === "Student Officer" && section !== "file"}
        />

        {section === "dashboard" && (
          <DashboardView
            activeUser={activeUser}
            applications={visibleApplications}
            queueCount={queueCount}
            onNewEvent={createApplication}
            onResetDemo={resetDemoData}
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
            onTemplateChange={updateTemplateValue}
            onPrecheck={() => setStatus("AI Pre-check", "TAMS Guide pre-check completed.")}
            onSubmit={() => setStatus("Submitted to SADU", "Student submitted the application to SADU.")}
            onGenerateGuide={generateGuide}
          />
        )}

        {section === "applications" && (
          <ApplicationsView
            application={selectedApp}
            applications={visibleApplications}
            activeUser={activeUser}
            completionPercent={completion.percent}
            onSelect={setSelectedAppId}
            onReview={() => setStatus("Under Review", "SADU opened the application for review.")}
            onRevision={requestRevision}
            onResubmit={() => setStatus("Resubmitted", "Student resubmitted after revision.")}
            onApprove={approveApplication}
            onReject={rejectApplication}
          />
        )}

        {section === "messages" && (
          <MessagesView application={selectedApp} messageDraft={messageDraft} setMessageDraft={setMessageDraft} onSend={() => sendMessage()} />
        )}

        {section === "guide" && (
          <GuideView
            application={selectedApp}
            guideMode={guideMode}
            setGuideMode={setGuideMode}
            guideQuestion={guideQuestion}
            setGuideQuestion={setGuideQuestion}
            guideOutput={guideOutput}
            onGenerateGuide={generateGuide}
          />
        )}
      </section>
    </main>
  );
}

function AccessScreen({
  activeUserId,
  setActiveUserId,
  onEnter,
}: {
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
                  <button key={user.id} className={user.id === activeUserId ? "role-chip active" : "role-chip"} onClick={() => setActiveUserId(user.id)}>
                    {roleIcons[user.role]}
                    {user.role}
                  </button>
                ))}
              </div>
              <button className="gold-button full" onClick={onEnter}>Enter as {activeUser.role}</button>
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
            <button className="link-button" onClick={() => setAccessStep("login")}>Back</button>
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
            <button className="link-button" onClick={() => setAccessStep("login")}>Back</button>
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
  activeUser: (typeof users)[number];
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
      <div className="logged-card"><span>Logged in as</span><strong>{activeUser.role}</strong></div>
      <nav className="nav-list" aria-label="Main navigation">
        {sectionItems.map((item) => (
          <button key={item.id} className={item.id === activeSection ? "nav-button active" : "nav-button"} onClick={() => setSection(item.id)}>
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
  onNewEvent,
  showNewEvent,
}: {
  title: string;
  activeUser: (typeof users)[number];
  onNewEvent: () => void;
  showNewEvent: boolean;
}) {
  return (
    <header className="topbar">
      <h1>{title}</h1>
      <div className="top-actions">
        <Bell size={19} />
        <div className="avatar">{activeUser.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
        <strong>{activeUser.name}</strong>
        <span className="role-badge">{activeUser.role}</span>
        {showNewEvent && <button className="primary-button" onClick={onNewEvent}><Plus size={18} /> File New Event</button>}
      </div>
    </header>
  );
}

function DashboardView({
  activeUser,
  applications,
  queueCount,
  onNewEvent,
  onResetDemo,
  onSelect,
}: {
  activeUser: (typeof users)[number];
  applications: EventApplication[];
  queueCount: number;
  onNewEvent: () => void;
  onResetDemo: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="screen-stack">
      <div className="dashboard-welcome">
        <div>
          <h2>Welcome, FEU Alabang {activeUser.role}</h2>
          <p>Friday, June 26, 2026 - Semester 2, A.Y. 2024-2025</p>
        </div>
        {activeUser.role === "Student Officer" && <button className="primary-button" onClick={onNewEvent}><Plus size={18} /> File New Event</button>}
      </div>

      <section className="stats-grid">
        <StatCard icon={<Clock3 />} value={queueCount || 3} label="Pending Applications" tone="gold" />
        <StatCard icon={<AlertTriangle />} value={applications.filter((app) => app.status === "Revision Requested").length} label="Needs Action" tone="red" />
        <StatCard icon={<CheckCircle2 />} value={applications.filter((app) => app.status === "SADU Approved").length} label="Approved Events" tone="green" />
        <StatCard icon={<MessageSquare />} value={applications.reduce((sum, app) => sum + app.messages.length, 0)} label="SADU Messages" tone="blue" />
      </section>

      <section className="guide-alert">
        <Sparkles size={18} />
        <div><strong>TAMS Guide Alert</strong><p>Tech Career Fair 2025 needs revised budget and participant clarification. Deadline in 6 days.</p></div>
        <button className="gold-button">View</button>
      </section>

      {activeUser.role === "Admin" && <ServiceReadinessPanel onResetDemo={onResetDemo} />}
      {activeUser.role === "Admin" && <AdminOperationsPanel />}

      <section className="table-card">
        <div className="table-header">
          <h2>Recent Applications</h2>
          <div><button className="ghost-button"><Filter size={15} /> Filter</button><button className="ghost-button">View All</button></div>
        </div>
        <table>
          <thead><tr><th>Event Name</th><th>Event Type</th><th>Submitted</th><th>Status</th><th>Required Action</th></tr></thead>
          <tbody>
            {applications.map((app) => (
              <tr key={app.id} onClick={() => onSelect(app.id)}>
                <td>{app.title}</td>
                <td>{app.eventType}</td>
                <td>{formatShortDate(app.timeline[0]?.createdAt ?? app.eventDate)}</td>
                <td><span className={`status-pill ${statusTone[app.status]}`}>{shortStatus(app.status)}</span></td>
                <td className="action-text">{app.status === "Revision Requested" ? "Revise budget" : app.status === "Draft" ? "Complete form" : app.status.includes("Submitted") ? "Awaiting SADU" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function AdminOperationsPanel() {
  return (
    <section className="admin-grid">
      <article className="admin-card">
        <div className="admin-card-heading"><Settings2 size={18} /><div><strong>Template Availability</strong><p>Prototype controls for the required event filing templates.</p></div></div>
        <div className="admin-list">
          {templateDefinitions.map((template) => (
            <div className="admin-row" key={template.id}>
              <div><strong>{template.name}</strong><span>{template.fields.filter((field) => field.required).length} required fields</span></div>
              <span className="status-pill green">Available</span>
            </div>
          ))}
        </div>
      </article>
      <article className="admin-card">
        <div className="admin-card-heading"><UsersRound size={18} /><div><strong>Users & Roles</strong><p>Demo accounts aligned with TAMS Access permissions.</p></div></div>
        <div className="admin-list">
          {users.map((user) => (
            <div className="admin-row" key={user.id}>
              <div><strong>{user.name}</strong><span>{user.title}</span></div>
              <span className="role-badge">{user.role}</span>
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
  const railwayReady = status?.railwayConfigured ?? false;
  const openAiReady = status?.openAiConfigured ?? false;

  return (
    <section className="service-grid">
      <article className="service-card">
        <span className={convexReady ? "service-icon ready" : "service-icon waiting"}><Database size={18} /></span>
        <div>
          <strong>Convex Project</strong>
          <p>{convexReady ? "Runtime Convex URL is configured." : "Waiting for Convex team/project selection."}</p>
        </div>
        <span className={convexReady ? "status-pill green" : "status-pill gold"}>{convexReady ? "Ready" : "Waiting"}</span>
      </article>
      <article className="service-card">
        <span className={railwayReady ? "service-icon ready" : "service-icon waiting"}><ShieldCheck size={18} /></span>
        <div>
          <strong>Railway Project</strong>
          <p>{railwayReady ? `Running on Railway${status?.railwayEnvironment ? ` (${status.railwayEnvironment})` : ""}.` : "Railway CLI is installed; OAuth account selection is still pending."}</p>
        </div>
        <span className={railwayReady ? "status-pill green" : "status-pill gold"}>{railwayReady ? "Ready" : "Waiting"}</span>
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
        <span className="service-icon ready"><RotateCcw size={18} /></span>
        <div>
          <strong>Demo Data</strong>
          <p>Restore local prototype data after a review or revision demo.</p>
        </div>
        <button className="secondary-button" onClick={onResetDemo}>Reset</button>
      </article>
    </section>
  );
}

function FileEventView({
  application,
  activeUser,
  completionPercent,
  guideOutput,
  onTemplateChange,
  onPrecheck,
  onSubmit,
  onGenerateGuide,
}: {
  application: EventApplication;
  activeUser: (typeof users)[number];
  completionPercent: number;
  guideOutput: string[];
  onTemplateChange: (templateId: string, fieldId: string, value: string) => void;
  onPrecheck: () => void;
  onSubmit: () => void;
  onGenerateGuide: () => void;
}) {
  const mainTemplates = templateDefinitions.slice(0, 4);
  const guideLines = guideOutput.length ? guideOutput : localGuideResponse(application, "missing", "");

  return (
    <section className="file-layout">
      <div className="form-column">
        <div className="section-heading"><h2>Submit Event Proposal</h2><p>Fill out all required fields and attach supporting documents.</p></div>
        <div className="panel">
          <h3>Event Information</h3>
          <div className="form-grid">
            <Field label="Event Title"><input value={application.title} readOnly /></Field>
            <Field label="Organization"><input value={application.organization} readOnly /></Field>
            <Field label="Event Type"><input value={application.eventType} readOnly /></Field>
            <Field label="Date & Time"><input value={application.eventDate} readOnly /></Field>
            <Field label="Venue"><input value={application.venue} readOnly /></Field>
            <Field label="Expected Participants"><input value={application.expectedParticipants} readOnly /></Field>
            <Field label="Adviser Name"><input value={activeUser.role === "Faculty Adviser" ? activeUser.name : "Prof. Maria Santos"} readOnly /></Field>
            <Field label="Budget Estimate (PHP)"><input value="25,000.00" readOnly /></Field>
            <Field label="Event Objectives" wide><textarea placeholder="Describe the purpose, goals, and expected outcomes of this event..." /></Field>
          </div>
        </div>

        <div className="panel">
          <h3>Upload Requirements</h3>
          <div className="requirement-grid">
            {mainTemplates.map((template) => {
              const status = getTemplateCompletion(application, template.id);
              return (
                <div className="requirement-tile" key={template.id}>
                  <UploadCloud size={18} />
                  <div><strong>{template.name.replace(" Template", "")}</strong><span>{status.complete ? "Ready" : "Required"}</span></div>
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
              const templateCompletion = getTemplateCompletion(application, template.id);
              return (
                <details key={template.id} className="template-card" open={templateCompletion.missing.length > 0}>
                  <summary>
                    <span><strong>{template.name}</strong><small>{template.description}</small></span>
                    <span className={templateCompletion.complete ? "ready-tag" : "missing-tag"}>{templateCompletion.completed}/{templateCompletion.required || template.fields.length}</span>
                  </summary>
                  <div className="field-grid">
                    {template.fields.map((field) => (
                      <label key={field.id} className="field">
                        <span>{field.label}{field.required ? " *" : ""}</span>
                        {field.type === "textarea" ? (
                          <textarea value={entry?.values[field.id] ?? ""} onChange={(event) => onTemplateChange(template.id, field.id, event.target.value)} />
                        ) : field.type === "select" ? (
                          <select value={entry?.values[field.id] ?? ""} onChange={(event) => onTemplateChange(template.id, field.id, event.target.value)}>
                            <option value="">Select</option>
                            {field.options?.map((option) => <option key={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input type={field.type} value={entry?.values[field.id] ?? ""} onChange={(event) => onTemplateChange(template.id, field.id, event.target.value)} />
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
        <div className="warning-box"><AlertTriangle size={16} /><div><strong>Completeness Check</strong><p>{completionPercent}% of required prototype templates are complete.</p></div></div>
        <button className="gold-button full" onClick={() => { onPrecheck(); onGenerateGuide(); }}><Sparkles size={16} /> Run AI Completeness Check</button>
        <div className="guide-says"><strong>TAMS Guide says:</strong>{guideLines.map((line) => <p key={line}>{line}</p>)}</div>
        <button className="primary-button full" disabled={completionPercent < 70} onClick={onSubmit}>Submit to SADU</button>
      </aside>
    </section>
  );
}

function ApplicationsView({
  application,
  applications,
  activeUser,
  completionPercent,
  onSelect,
  onReview,
  onRevision,
  onResubmit,
  onApprove,
  onReject,
}: {
  application: EventApplication;
  applications: EventApplication[];
  activeUser: (typeof users)[number];
  completionPercent: number;
  onSelect: (id: string) => void;
  onReview: () => void;
  onRevision: () => void;
  onResubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="screen-stack">
      <div className="application-title-row">
        <div><h2>{application.title}</h2><p>Application ID: {application.id.toUpperCase()} · {application.eventType} · {application.organization}</p></div>
        <span className={`status-pill ${statusTone[application.status]}`}>{application.status}</span>
      </div>

      <section className="status-card">
        <div className="status-header"><strong>Application Progress</strong><span>{completionPercent}%</span></div>
        <div className="progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
        <div className="progress-steps">
          {["Draft", "Submitted to SADU", "Under Review", "Revision Requested", "SADU Approved"].map((status) => {
            const hit = application.timeline.find((entry) => entry.status === status);
            return <div key={status} className={hit ? "progress-step done" : "progress-step"}><span /><strong>{status}</strong><small>{hit ? formatShortDate(hit.createdAt) : "-"}</small></div>;
          })}
        </div>
      </section>

      <section className="applications-layout">
        <div className="panel">
          <h3>Required Actions</h3>
          <div className="action-list">
            {getApplicationCompletion(application).missing.slice(0, 3).map((item) => (
              <div className="required-action" key={item}><CircleAlert size={18} /><div><strong>{item.split(":")[0]}</strong><p>{item.split(":")[1] ?? "Complete before proceeding."}</p></div></div>
            ))}
            {!getApplicationCompletion(application).missing.length && <div className="required-action ok"><CheckCircle2 size={18} /><div><strong>No missing prototype fields</strong><p>Ready for human review.</p></div></div>}
          </div>
          <WorkflowActions role={activeUser.role} status={application.status} onReview={onReview} onRevision={onRevision} onResubmit={onResubmit} onApprove={onApprove} onReject={onReject} />
        </div>

        <div className="panel">
          <h3>Communication Thread</h3>
          <MiniThread application={application} />
        </div>
      </section>

      <section className="table-card">
        <div className="table-header"><h2>All Visible Applications</h2></div>
        <div className="application-list compact">
          {applications.map((app) => (
            <button key={app.id} className={app.id === application.id ? "application-card active" : "application-card"} onClick={() => onSelect(app.id)}>
              <div><strong>{app.title}</strong><span>{app.organization}</span></div>
              <span className={`status-pill ${statusTone[app.status]}`}>{shortStatus(app.status)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MessagesView({
  application,
  messageDraft,
  setMessageDraft,
  onSend,
}: {
  application: EventApplication;
  messageDraft: string;
  setMessageDraft: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <section className="messages-layout">
      <aside className="thread-list panel">
        <div className="search-box"><Search size={16} /><input placeholder="Search messages..." /></div>
        {["SADU Review", "Junior Philippine CS Society", "Student Council Federation"].map((thread, index) => (
          <button key={thread} className={index === 0 ? "thread-item active" : "thread-item"}><strong>{thread}</strong><span>{index === 0 ? "Please revise the budget breakdown." : "Joint event proposal attached."}</span></button>
        ))}
      </aside>
      <section className="chat-panel panel">
        <h2>SADU Review</h2>
        <MiniThread application={application} expanded />
        <div className="composer-row"><input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Type a message..." /><button className="send-button" onClick={onSend}><SendHorizonal size={18} /></button></div>
      </section>
      <section className="partner-card">
        <Sparkles size={18} />
        <div><strong>TAMS Guide - Suggested Partners</strong><p>This event may fit collaboration with Junior Philippine Computer Society and FEU Engineering Society.</p></div>
        <span>Junior Philippine CS Society +</span><span>Student Council Federation +</span><span>FEU Engineering Society +</span>
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
  onGenerateGuide,
}: {
  application: EventApplication;
  guideMode: GuideMode;
  setGuideMode: (mode: GuideMode) => void;
  guideQuestion: string;
  setGuideQuestion: (value: string) => void;
  guideOutput: string[];
  onGenerateGuide: () => void;
}) {
  const lines = guideOutput.length ? guideOutput : localGuideResponse(application, "summary", guideQuestion);

  return (
    <div className="screen-stack">
      <section className="guide-hero">
        <div><p className="guide-kicker"><ShieldCheck size={16} /> TAMS Hub Overview</p><h2>Streamlining FEU student organization workflows - from proposal to approval.</h2><p>TAMS Hub helps student organizations submit event requirements, track SADU approvals, communicate in one place, and reduce incomplete filings through TAMS Access and TAMS Guide.</p></div>
        <MascotLogo large />
      </section>

      <section className="feature-grid">
        <Feature icon={<ShieldCheck />} title="TAMS Access" text="Multi-factor authentication with NFC card, OTP, and FEU SSO placeholders." />
        <Feature icon={<FilePlus2 />} title="Event Filing" text="Structured event proposal forms with AI-guided completeness checks." />
        <Feature icon={<Bot />} title="TAMS Guide" text="Summaries, missing field checks, revision drafts, and filing answers." />
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
          <select value={guideMode} onChange={(event) => setGuideMode(event.target.value as GuideMode)}>
            <option value="checklist">Requirement checklist</option>
            <option value="missing">Missing fields</option>
            <option value="summary">SADU summary</option>
            <option value="revision">Revision draft</option>
            <option value="question">Filing question</option>
          </select>
          {guideMode === "question" && <textarea value={guideQuestion} onChange={(event) => setGuideQuestion(event.target.value)} />}
          <button className="primary-button" onClick={onGenerateGuide}><Sparkles size={18} /> Generate Guidance</button>
        </div>
        <div className="guide-output">{lines.map((line) => <p key={line}>{line}</p>)}</div>
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
}: {
  role: Role;
  status: EventStatus;
  onReview: () => void;
  onRevision: () => void;
  onResubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (role === "SADU Associate") {
    return <div className="action-row"><button className="secondary-button" onClick={onReview}>Mark Under Review</button><button className="gold-button" onClick={onRevision}>Request Revision</button><button className="danger-button" onClick={onReject}>Reject</button><button className="primary-button" onClick={onApprove}>Approve</button></div>;
  }
  if (role === "Student Officer" && status === "Revision Requested") {
    return <button className="primary-button full" onClick={onResubmit}><UploadCloud size={16} /> Upload Revised Documents</button>;
  }
  return <p className="fine-print">Actions shown here depend on the verified TAMS Access role.</p>;
}

function MiniThread({ application, expanded = false }: { application: EventApplication; expanded?: boolean }) {
  const messages = application.messages.length ? application.messages : [{ id: "empty", author: "TAMS Hub", role: "SADU Associate" as Role, body: "No messages yet.", createdAt: new Date().toISOString() }];
  return (
    <div className={expanded ? "chat-thread expanded" : "chat-thread"}>
      {messages.map((message, index) => (
        <div key={message.id} className={index % 2 ? "chat-bubble own" : "chat-bubble"}>
          <strong>{message.author}</strong>
          <p>{message.body}</p>
          <span>{formatShortDate(message.createdAt)}</span>
        </div>
      ))}
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function shortStatus(status: EventStatus) {
  if (status === "Revision Requested") return "Needs Revision";
  if (status === "Submitted to SADU" || status === "Under Review" || status === "Resubmitted") return "For Review";
  if (status === "SADU Approved") return "Approved";
  return status;
}
