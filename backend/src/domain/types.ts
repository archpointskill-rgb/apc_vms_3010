export const ROLES = ["reception", "host", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const VISITOR_TYPES = ["Client", "Vendor and site vendor", "Interview candidate", "Wellness session"] as const;
export type VisitorType = (typeof VISITOR_TYPES)[number];

export const VISIT_STATUSES = ["Waiting", "In meeting", "Checked out", "Cancelled", "Denied"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export const ACTIVE_STATUSES = ["Waiting", "In meeting"] as const satisfies readonly VisitStatus[];

export const APPOINTMENT_STATUSES = ["Pending approval", "Approved", "Declined"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const PURPOSES = [
  "Project discussion", "Vendor quote", "Site matter", "Interview",
  "Wellness session", "Payment or accounts", "Delivery", "Other"
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const HOST_REPLIES = ["Send in", "Wait 10 minutes", "Can't meet today", "Reschedule"] as const;
export type HostReply = (typeof HOST_REPLIES)[number];

export const FLOORS = ["Ground", "2nd", "3rd"] as const;
export type Floor = (typeof FLOORS)[number];

export const isActive = (status: VisitStatus) => (ACTIVE_STATUSES as readonly VisitStatus[]).includes(status);

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
export const OPEN_TASK_STATUSES = ["Open", "In progress"] as const satisfies readonly TaskStatus[];

export const GIFT_DIRECTIONS = ["Given", "Received"] as const;
export type GiftDirection = (typeof GIFT_DIRECTIONS)[number];

export const GIFT_STATUSES = [
  "Planned", "Pending approval", "Approved", "Dispatched", "Delivered", "Received", "Cancelled", "Returned"
] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

export const CHANNELS = ["Email", "WhatsApp", "Phone", "SMS"] as const;
export type Channel = (typeof CHANNELS)[number];
