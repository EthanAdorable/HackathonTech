import type { EventApplication, EventStatus, Message, Role, TimelineEntry } from "./tams-data";

export function transitionApplication(
  application: EventApplication,
  status: EventStatus,
  note: string,
): EventApplication {
  const timelineEntry: TimelineEntry = {
    id: `timeline-${Date.now()}`,
    status,
    note,
    createdAt: new Date().toISOString(),
  };

  return {
    ...application,
    status,
    timeline: [...application.timeline, timelineEntry],
  };
}

export function addMessage(
  application: EventApplication,
  author: string,
  role: Role,
  body: string,
): EventApplication {
  const message: Message = {
    id: `message-${Date.now()}`,
    author,
    role,
    body,
    createdAt: new Date().toISOString(),
  };

  return {
    ...application,
    messages: [...application.messages, message],
  };
}
