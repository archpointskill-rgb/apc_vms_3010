import type { Role } from "./types";

export type Action =
  | "contact.read" | "contact.create" | "contact.edit" | "contact.delete" | "contact.viewFullDob" | "contact.import"
  | "visit.read" | "visit.checkIn" | "visit.manage" | "visit.reply"
  | "appointment.read" | "appointment.book" | "appointment.decide"
  | "report.view" | "audit.view"
  | "export.todayOnly" | "export.ownOnly" | "export.everything"
  | "master.manage" | "staff.manage" | "settings.manage"
  | "pr.read" | "pr.manage" | "pr.notesRestricted" | "pr.export"
  | "gift.propose" | "gift.decide" | "gift.delete";

/**
 * What each role may do. The API checks this on every route; the database
 * repeats the important parts in its row level security, so a mistake in one
 * layer is not enough to leak anything.
 */
const MATRIX: Readonly<Record<Role, readonly Action[]>> = {
  reception: [
    "contact.read", "contact.create", "contact.edit", "contact.import",
    "visit.read", "visit.checkIn", "visit.manage",
    "appointment.read", "appointment.book",
    "export.todayOnly",
    // the office keeps its relationships at the front desk too
    "pr.read", "pr.manage", "gift.propose"
  ],
  host: ["visit.read", "visit.reply", "appointment.read", "appointment.book", "appointment.decide", "export.ownOnly"],
  manager: [
    "contact.read", "contact.create", "contact.edit", "contact.import", "contact.viewFullDob",
    "visit.read", "visit.checkIn", "visit.manage", "visit.reply",
    "appointment.read", "appointment.book", "appointment.decide",
    "report.view", "audit.view", "export.everything",
    "pr.read", "pr.manage", "pr.notesRestricted", "pr.export",
    "gift.propose", "gift.decide", "gift.delete"
  ],
  admin: [
    "contact.read", "contact.create", "contact.edit", "contact.delete", "contact.import", "contact.viewFullDob",
    "visit.read", "visit.checkIn", "visit.manage", "visit.reply",
    "appointment.read", "appointment.book", "appointment.decide",
    "report.view", "audit.view", "export.everything",
    "master.manage", "staff.manage", "settings.manage",
    "pr.read", "pr.manage", "pr.notesRestricted", "pr.export",
    "gift.propose", "gift.decide", "gift.delete"
  ]
};

export const can = (role: Role | null | undefined, action: Action): boolean =>
  !!role && MATRIX[role].includes(action);

export const allowedActions = (role: Role): readonly Action[] => MATRIX[role];
