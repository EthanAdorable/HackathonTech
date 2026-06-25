"use client";

import {
  Archive,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  IdCard,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  statuses,
  templateDefinitions,
  users,
} from "@/lib/tams-data";
import { addMessage, transitionApplication } from "@/lib/workflow";

const storageKey = "tams-hub-prototype-state";

const roleIcons: Record<Role, React.ReactNode> = {
  "Student Officer": <FileText size={18} />,
  "SADU Associate": <ShieldCheck size={18} />,
  "Faculty Adviser": <ClipboardCheck size={18} />,
  Admin: <Users size={18} />,
};

const statusTone: Record<EventStatus, string> = {
  Draft: "neutral",
  "Template Completion": "blue",
  "AI Pre-check": "gold",
  "Submitted to SADU": "blue",
  "Under Review": "gold",
  "Revision Requested": "red",
  Resubmitted: "blue",
  "SADU Approved": "green",
  Rejected: "red",
  Archived: "neutral",
};

type GuideMode = "checklist" | "missing" | "summary" | "revision" | "question";

export function TamsHubApp() {
  const [activeUserId, setActiveUserId] = useState("juan");
  const [applications, setApplications] = useState<EventApplication[]>(seedApplications);
  const [selectedAppId, setSelectedAppId] = useState(seedApplications[0].id);
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
        setSelectedAppId(parsed[0]?.id ?? seedApplications[0].id);
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
    if (!visibleApplications.some((application) => application.id === selectedAppId)) {
      setSelectedAppId(visibleApplications[0]?.id ?? applications[0]?.id);
    }
  }, [applications, selectedAppId, visibleApplications]);

  const completion = getApplicationCompletion(selectedApp);
  const queueCount = applications.filter((application) =>
    ["Submitted to SADU", "Resubmitted", "Under Review"].includes(application.status),
  ).length;

  function updateApplication(next: EventApplication) {
    setApplications((current) =>
      current.map((application) => (application.id === next.id ? next : application)),
    );
  }

  function updateTemplateValue(templateId: string, fieldId: string, value: string) {
    const updated: EventApplication = {
      ...selectedApp,
      status: selectedApp.status === "Draft" ? "Template Completion" : selectedApp.status,
      templates: selectedApp.templates.map((template) =>
        template.templateId === templateId
          ? { ...template, values: { ...template.values, [fieldId]: value } }
          : template,
      ),
    };
    updateApplication(updated);
  }

  function createApplication() {
    const id = `app-${Date.now()}`;
    const next: EventApplication = {
      id,
      title: "New Campus Event",
      organization: activeUser.organization ?? "Junior Philippine Computer Society",
      eventType: "Workshop",
      venue: "To be assigned",
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
    const withMessage = addMessage(
      selectedApp,
      activeUser.name,
      activeUser.role,
      "Approved. Final decision recorded by SADU reviewer.",
    );
    updateApplication(transitionApplication(withMessage, "SADU Approved", "SADU approved the application."));
  }

  function rejectApplication() {
    const withMessage = addMessage(
      selectedApp,
      activeUser.name,
      activeUser.role,
      "Rejected by SADU after human review. Please coordinate before filing again.",
    );
    updateApplication(transitionApplication(withMessage, "Rejected", "SADU rejected the application."));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TH</div>
          <div>
            <strong>TAMS Hub</strong>
            <span>FEU Alabang</span>
          </div>
        </div>

        <div className="access-card">
          <div className="access-row">
            <LockKeyhole size={18} />
            <span>TAMS Access</span>
          </div>
          <strong>{activeUser.name}</strong>
          <span>{activeUser.title}</span>
          <div className="tap-row">
            <IdCard size={16} />
            <span>OTP verified + NFC tap simulated</span>
          </div>
        </div>

        <nav className="role-list" aria-label="Demo roles">
          {users.map((user) => (
            <button
              key={user.id}
              className={user.id === activeUserId ? "role-button active" : "role-button"}
              onClick={() => setActiveUserId(user.id)}
            >
              {roleIcons[user.role]}
              <span>{user.role}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI-assisted campus workflow</p>
            <h1>{dashboardTitle(activeUser.role)}</h1>
          </div>
          <div className="top-actions">
            <div className="metric compact">
              <span>Review queue</span>
              <strong>{queueCount}</strong>
            </div>
            {activeUser.role === "Student Officer" && (
              <button className="primary-button" onClick={createApplication}>
                <Plus size={18} />
                New event
              </button>
            )}
          </div>
        </header>

        <section className="dashboard-grid">
          <div className="panel span-2">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">TAMS Events</p>
                <h2>Applications</h2>
              </div>
              <LayoutDashboard size={20} />
            </div>
            <div className="application-list">
              {visibleApplications.map((application) => {
                const appCompletion = getApplicationCompletion(application);
                return (
                  <button
                    key={application.id}
                    className={application.id === selectedApp.id ? "application-card active" : "application-card"}
                    onClick={() => setSelectedAppId(application.id)}
                  >
                    <div>
                      <strong>{application.title}</strong>
                      <span>{application.organization}</span>
                    </div>
                    <div className="application-meta">
                      <span className={`status-pill ${statusTone[application.status]}`}>{application.status}</span>
                      <span>{appCompletion.percent}% templates</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Role dashboard</p>
                <h2>{activeUser.role}</h2>
              </div>
              {roleIcons[activeUser.role]}
            </div>
            <div className="metric-grid">
              <div className="metric">
                <span>Total apps</span>
                <strong>{visibleApplications.length}</strong>
              </div>
              <div className="metric">
                <span>Approved</span>
                <strong>{visibleApplications.filter((app) => app.status === "SADU Approved").length}</strong>
              </div>
              <div className="metric">
                <span>Needs action</span>
                <strong>{visibleApplications.filter((app) => app.status === "Revision Requested").length}</strong>
              </div>
            </div>
            <p className="role-note">{roleNote(activeUser.role)}</p>
          </div>
        </section>

        <section className="detail-grid">
          <article className="panel detail-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{selectedApp.eventType}</p>
                <h2>{selectedApp.title}</h2>
              </div>
              <span className={`status-pill ${statusTone[selectedApp.status]}`}>{selectedApp.status}</span>
            </div>

            <div className="summary-grid">
              <SummaryItem label="Venue" value={selectedApp.venue} />
              <SummaryItem label="Event date" value={selectedApp.eventDate} />
              <SummaryItem label="Participants" value={String(selectedApp.expectedParticipants)} />
              <SummaryItem label="Risk" value={selectedApp.riskLevel} />
            </div>

            <div className="progress-row">
              <div>
                <strong>{completion.percent}% complete</strong>
                <span>{completion.complete} of {completion.total} templates ready</span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${completion.percent}%` }} />
              </div>
            </div>

            <ActionBar
              role={activeUser.role}
              status={selectedApp.status}
              completionPercent={completion.percent}
              onPrecheck={() => setStatus("AI Pre-check", "TAMS Guide pre-check completed.")}
              onSubmit={() => setStatus("Submitted to SADU", "Student submitted the application to SADU.")}
              onReview={() => setStatus("Under Review", "SADU opened the application for review.")}
              onRevision={requestRevision}
              onResubmit={() => setStatus("Resubmitted", "Student resubmitted after revision.")}
              onApprove={approveApplication}
              onReject={rejectApplication}
              onArchive={() => setStatus("Archived", "Application archived.")}
            />
          </article>

          <aside className="panel guide-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">TAMS Guide</p>
                <h2>AI guidance</h2>
              </div>
              <Bot size={20} />
            </div>
            <div className="guide-controls">
              <select value={guideMode} onChange={(event) => setGuideMode(event.target.value as GuideMode)}>
                <option value="checklist">Requirement checklist</option>
                <option value="missing">Missing fields</option>
                <option value="summary">SADU summary</option>
                <option value="revision">Revision draft</option>
                <option value="question">Filing question</option>
              </select>
              {guideMode === "question" && (
                <textarea value={guideQuestion} onChange={(event) => setGuideQuestion(event.target.value)} />
              )}
              <button className="primary-button full" onClick={generateGuide}>
                <Sparkles size={18} />
                Generate
              </button>
            </div>
            <div className="guide-output">
              {(guideOutput.length ? guideOutput : localGuideResponse(selectedApp, "summary", guideQuestion)).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <p className="fine-print">AI guidance only. Final decisions remain with SADU and human reviewers.</p>
          </aside>
        </section>

        <section className="detail-grid lower">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Template library</p>
                <h2>Completion editor</h2>
              </div>
              <FileText size={20} />
            </div>
            <div className="template-stack">
              {templateDefinitions.map((template) => {
                const entry = selectedApp.templates.find((item) => item.templateId === template.id);
                const templateCompletion = getTemplateCompletion(selectedApp, template.id);
                return (
                  <details key={template.id} className="template-card" open={templateCompletion.missing.length > 0}>
                    <summary>
                      <span>
                        <strong>{template.name}</strong>
                        <small>{template.description}</small>
                      </span>
                      <span className={templateCompletion.complete ? "ready-tag" : "missing-tag"}>
                        {templateCompletion.completed}/{templateCompletion.required || template.fields.length}
                      </span>
                    </summary>
                    {activeUser.role === "Admin" && (
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={entry?.enabled ?? true}
                          onChange={(event) => {
                            updateApplication({
                              ...selectedApp,
                              templates: selectedApp.templates.map((item) =>
                                item.templateId === template.id ? { ...item, enabled: event.target.checked } : item,
                              ),
                            });
                          }}
                        />
                        Available in prototype
                      </label>
                    )}
                    <div className="field-grid">
                      {template.fields.map((field) => (
                        <label key={field.id} className="field">
                          <span>{field.label}{field.required ? " *" : ""}</span>
                          {field.type === "textarea" ? (
                            <textarea
                              value={entry?.values[field.id] ?? ""}
                              onChange={(event) => updateTemplateValue(template.id, field.id, event.target.value)}
                            />
                          ) : field.type === "select" ? (
                            <select
                              value={entry?.values[field.id] ?? ""}
                              onChange={(event) => updateTemplateValue(template.id, field.id, event.target.value)}
                            >
                              <option value="">Select</option>
                              {field.options?.map((option) => <option key={option}>{option}</option>)}
                            </select>
                          ) : (
                            <input
                              type={field.type}
                              value={entry?.values[field.id] ?? ""}
                              onChange={(event) => updateTemplateValue(template.id, field.id, event.target.value)}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </article>

          <aside className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Messages</p>
                <h2>Revision thread</h2>
              </div>
              <MessageSquare size={20} />
            </div>
            <div className="message-list">
              {selectedApp.messages.length === 0 && <p className="empty">No messages yet.</p>}
              {selectedApp.messages.map((message) => (
                <div key={message.id} className="message">
                  <strong>{message.author}</strong>
                  <span>{message.role} · {formatDate(message.createdAt)}</span>
                  <p>{message.body}</p>
                </div>
              ))}
            </div>
            <div className="composer">
              <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} />
              <button className="primary-button full" onClick={() => sendMessage()}>
                <Send size={18} />
                Send message
              </button>
            </div>
          </aside>
        </section>

        <section className="panel timeline-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Status tracker</p>
              <h2>Timeline</h2>
            </div>
            <Inbox size={20} />
          </div>
          <div className="timeline">
            {statuses.map((status) => {
              const hit = selectedApp.timeline.findLast((entry) => entry.status === status);
              return (
                <div key={status} className={hit ? "timeline-step done" : "timeline-step"}>
                  <span />
                  <strong>{status}</strong>
                  <small>{hit ? `${hit.note} ${formatDate(hit.createdAt)}` : "Waiting"}</small>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionBar({
  role,
  status,
  completionPercent,
  onPrecheck,
  onSubmit,
  onReview,
  onRevision,
  onResubmit,
  onApprove,
  onReject,
  onArchive,
}: {
  role: Role;
  status: EventStatus;
  completionPercent: number;
  onPrecheck: () => void;
  onSubmit: () => void;
  onReview: () => void;
  onRevision: () => void;
  onResubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onArchive: () => void;
}) {
  if (role === "Student Officer") {
    return (
      <div className="action-row">
        <button className="secondary-button" onClick={onPrecheck}>
          <RefreshCw size={18} />
          Run pre-check
        </button>
        {status === "Revision Requested" ? (
          <button className="primary-button" onClick={onResubmit}>
            <Send size={18} />
            Resubmit
          </button>
        ) : (
          <button className="primary-button" disabled={completionPercent < 70} onClick={onSubmit}>
            <Send size={18} />
            Submit to SADU
          </button>
        )}
      </div>
    );
  }

  if (role === "SADU Associate") {
    return (
      <div className="action-row">
        <button className="secondary-button" onClick={onReview}>
          <ClipboardCheck size={18} />
          Mark under review
        </button>
        <button className="secondary-button danger" onClick={onRevision}>
          <RefreshCw size={18} />
          Request revision
        </button>
        <button className="secondary-button danger" onClick={onReject}>
          <XCircle size={18} />
          Reject
        </button>
        <button className="primary-button" onClick={onApprove}>
          <CheckCircle2 size={18} />
          Approve
        </button>
      </div>
    );
  }

  if (role === "Faculty Adviser") {
    return (
      <div className="action-row">
        <button className="secondary-button" onClick={onPrecheck}>
          <MessageSquare size={18} />
          Add endorsement note
        </button>
      </div>
    );
  }

  return (
    <div className="action-row">
      <button className="secondary-button" onClick={onArchive}>
        <Archive size={18} />
        Archive
      </button>
    </div>
  );
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
      "Complete the required templates, run the TAMS Guide pre-check, keep adviser/SADU messages in the thread, and wait for SADU's human decision.",
    ];
  }
  return [makeAiSummary(application)];
}

function dashboardTitle(role: Role) {
  if (role === "Student Officer") return "Student Officer Dashboard";
  if (role === "SADU Associate") return "SADU Review Queue";
  if (role === "Faculty Adviser") return "Faculty Adviser View";
  return "Admin Console";
}

function roleNote(role: Role) {
  if (role === "Student Officer") return "Create event filings, complete templates, submit to SADU, and answer revision requests.";
  if (role === "SADU Associate") return "Review submissions, read AI summaries, request revisions, approve, reject, and message organizations.";
  if (role === "Faculty Adviser") return "Monitor organization applications and add endorsement or coordination comments.";
  return "View users, roles, organizations, and prototype template availability.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
