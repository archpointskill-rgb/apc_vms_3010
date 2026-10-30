export type Role = "reception" | "host" | "manager" | "admin";
export type VisitStatus = "Waiting" | "In meeting" | "Checked out" | "Cancelled" | "Denied";
export type AppointmentStatus = "Pending approval" | "Approved" | "Declined";

export const VISITOR_TYPES = ["Client", "Vendor and site vendor", "Interview candidate", "Wellness session"] as const;
export type VisitorType = (typeof VISITOR_TYPES)[number];

export const PURPOSES = [
  "Project discussion", "Vendor quote", "Site matter", "Interview",
  "Wellness session", "Payment or accounts", "Delivery", "Other"
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const HOST_REPLIES = ["Send in", "Wait 10 minutes", "Can't meet today", "Reschedule"] as const;
export type HostReply = (typeof HOST_REPLIES)[number];

export type Action =
  | "contact.read" | "contact.create" | "contact.edit" | "contact.delete" | "contact.viewFullDob" | "contact.import"
  | "visit.read" | "visit.checkIn" | "visit.manage" | "visit.reply"
  | "appointment.read" | "appointment.book" | "appointment.decide"
  | "report.view" | "audit.view"
  | "export.todayOnly" | "export.ownOnly" | "export.everything"
  | "master.manage" | "staff.manage" | "settings.manage"
  | "pr.read" | "pr.manage" | "pr.notesRestricted" | "pr.export"
  | "gift.propose" | "gift.decide" | "gift.delete";

export interface SignedInUser {
  id: string; email: string; fullName: string; role: Role; hostId: number | null; hostName: string | null;
}

export interface Host {
  id: number; name: string; designation: string | null; department: string | null;
  floor: string; defaultRoomId: number | null; defaultRoomName: string | null;
  mobile: string | null; email: string | null; active: boolean;
}
export interface Room { id: number; name: string; floor: string; active?: boolean }

export interface Contact {
  id: number; code: string; fullName: string; mobile: string; email: string | null;
  dateOfBirth: string | null; birthday: string | null; address: string | null;
  organisation: string | null; designation: string | null; notes: string | null;
  isPrContact: boolean; isSample: boolean; createdAt: string;
  visitCount?: number; lastVisit?: string | null;
  visits?: ContactVisit[];
}
export interface ContactVisit {
  id: number; checkIn: string; checkOut: string | null; status: VisitStatus;
  visitorType: VisitorType; purpose: Purpose; hostName: string | null;
}
export interface Duplicate {
  id: number; code: string; fullName: string; mobile: string; organisation: string | null;
  reason: "mobile" | "email" | "name";
}

export interface Visit {
  id: number; status: VisitStatus; visitorType: VisitorType; purpose: Purpose; remarks: string | null;
  checkIn: string; checkOut: string | null; reason: string | null;
  reply: HostReply | null; repliedAt: string | null; waitUntil: string | null;
  reminders: number; appointmentId: number | null; isSample: boolean;
  durationMinutes: number | null; needsReview: boolean; unassigned: boolean;
  contact: { id: number; code: string; name: string; mobile: string; organisation: string | null };
  host: { id: number; name: string } | null;
  room: { id: number; name: string; floor: string } | null;
}

export interface Appointment {
  id: number; guestName: string; guestMobile: string; visitorType: VisitorType; purpose: Purpose;
  note: string | null; status: AppointmentStatus; startsAt: string; durationMinutes: number;
  contactId: number | null; contactCode: string | null;
  hostId: number; hostName: string;
  roomId: number | null; roomName: string | null; roomFloor: string | null;
  visitId: number | null;
}
export interface Clash {
  roomId: number; roomName: string;
  first: { id: number; label: string }; second: { id: number; label: string };
}

export interface Summary {
  insideNow: number; waitingNow: number; visitsToday: number; avgStayMinutes: number | null; flagged: number;
  byType: Bar[]; byDay: Bar[]; byHour: Bar[]; byHost: Bar[];
  repeatVisitors: { code: string; name: string; visits: number; lastVisit: string }[];
}
export interface Bar { label: string; n: number }

export interface StaffAccount {
  id: string; fullName: string; email: string; role: Role;
  hostId: number | null; hostName: string | null; active: boolean; createdAt: string;
}
export interface Notification {
  id: number; visitId: number | null; body: string; createdAt: string; readAt: string | null;
}
export interface AuditEntry {
  id: number; at: string; actorName: string | null; action: string; entity: string; entityId: string | null;
}

// ---------------------------------------------------------------- Public Relations
export const PR_CATEGORIES = [
  "Team", "Client", "Known or Acquaintance", "Contractor", "Vendor",
  "Consultant", "Partner", "Prospect", "Media", "Other"
] as const;
export type PrCategory = (typeof PR_CATEGORIES)[number];

export const PR_PRIORITIES = ["Standard", "Important", "Key relationship"] as const;
export type PrPriority = (typeof PR_PRIORITIES)[number];

export const PR_STATUSES = ["Active", "Inactive", "Archived", "Do not contact"] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const GIFT_TIERS = ["Standard", "Premium", "Custom", "No gifts"] as const;
export type GiftTier = (typeof GIFT_TIERS)[number];

export const PR_SOURCES = ["Visit", "Referral", "Event", "Website", "Social media", "Import", "Direct contact"] as const;
export type PrSource = (typeof PR_SOURCES)[number];

export const INTERACTION_KINDS = ["Call", "Meeting", "Office visit", "Email", "Event", "Referral", "Gift", "Other"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const TASK_STATUSES = ["Open", "In progress", "Completed", "Cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const GIFT_DIRECTIONS = ["Given", "Received"] as const;
export type GiftDirection = (typeof GIFT_DIRECTIONS)[number];

export type GiftStatus =
  | "Planned" | "Pending approval" | "Approved" | "Dispatched"
  | "Delivered" | "Received" | "Cancelled" | "Returned";

export const CHANNELS = ["Email", "WhatsApp", "Phone", "SMS"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface PrProfile {
  contactId: number; categories: PrCategory[]; ownerId: string | null; ownerName: string | null;
  introduction: string | null; priority: PrPriority; giftTier: GiftTier; source: PrSource | null;
  introducedById: number | null; introducedByName: string | null;
  industry: string | null; interests: string | null; organisationNote: string | null;
  preferredChannel: Channel | null; preferredLanguage: string | null; bestTime: string | null;
  tags: string[]; status: PrStatus; referenceStaffId: string | null; referenceStaffName: string | null;
  createdAt: string; updatedAt: string;
  contactCode: string; fullName: string; mobile: string; email: string | null;
  organisation: string | null; designation: string | null;
  lastInteraction: string | null; nextAction: string | null; overdueTasks: number;
}

export interface PrNote { id: number; body: string; restricted: boolean; createdAt: string; authorName: string | null }
export interface PrKeyDate { id: number; occasion: string; onDate: string }
export interface PrInteraction {
  id: number; kind: InteractionKind; happenedAt: string; summary: string;
  outcome: string | null; project: string | null; visitId: number | null; giftId: number | null; staffName: string | null;
}
export interface PrTask {
  id: number; contactId: number; contactName: string; contactCode: string;
  description: string; dueOn: string; status: TaskStatus; completedAt: string | null;
  ownerId: string | null; ownerName: string | null; overdue: boolean;
}
export interface PrGift {
  id: number; contactId: number; contactName: string; contactCode: string;
  direction: GiftDirection; occasion: string; item: string; tier: GiftTier;
  plannedOn: string; plannedValue: number; zeroValueReason: string | null; currency: string;
  status: GiftStatus; approvedById: string | null; approvedByName: string | null; approvedAt: string | null;
  decisionNote: string | null; actualValue: number | null; completedOn: string | null;
  supplier: string | null; deliveryNote: string | null; overrideReason: string | null;
  createdById: string | null; createdByName: string | null; createdAt: string;
}
export interface PrConsent {
  channel: Channel; optedIn: boolean; source: string; recordedAt: string; mayContact: boolean;
}
export interface PrAttachment {
  id: number; storagePath: string; fileName: string; contentType: string | null;
  sizeBytes: number | null; caption: string | null; createdAt: string; uploadedByName: string | null;
}
export interface PrDetail extends PrProfile {
  notes: PrNote[]; keyDates: PrKeyDate[]; interactions: PrInteraction[];
  tasks: PrTask[]; gifts: PrGift[]; attachments: PrAttachment[]; consent: PrConsent[];
}
export interface PrSummary {
  relationships: number; keyRelationships: number; doNotContact: number;
  openTasks: number; overdueTasks: number; giftsAwaitingApproval: number; interactions30Days: number;
  categories: Bar[];
}
export interface UpcomingDate {
  contact_id: number; contact_code: string; full_name: string; occasion: string; on_day: string; days_away: number;
}
