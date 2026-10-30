import { config } from "../config";
import { badRequest, conflict } from "../lib/errors";
import { isActive, type HostReply, type Purpose, type VisitStatus, type VisitorType } from "./types";

export interface VisitState {
  status: VisitStatus;
  checkIn: Date;
  checkOut: Date | null;
  reason: string | null;
  reply: HostReply | null;
  repliedAt: Date | null;
  waitUntil: Date | null;
}

/** The change a transition asks the database to make. */
export type VisitPatch = Partial<VisitState>;

/**
 * Every rule about how a visit may move between states, in one place and with
 * no database behind it, so it can be read and tested on its own.
 */
export const Visit = {
  /** A wellness visit records only "Wellness session", whatever was typed. */
  purposeFor(visitorType: VisitorType, purpose: Purpose): Purpose {
    return visitorType === "Wellness session" ? "Wellness session" : purpose;
  },

  startMeeting(v: VisitState): VisitPatch {
    if (v.status !== "Waiting") throw badRequest("Only a waiting visitor can be sent in.");
    return { status: "In meeting", reply: v.reply ?? "Send in" };
  },

  checkOut(v: VisitState, at: Date = new Date()): VisitPatch {
    if (!isActive(v.status)) throw badRequest("This visit is already closed.");
    if (at.getTime() < v.checkIn.getTime()) throw badRequest("The check-out time cannot be before the check-in time.");
    return { status: "Checked out", checkOut: at };
  },

  cancel(v: VisitState, reason: string, at: Date = new Date()): VisitPatch {
    return close(v, "Cancelled", reason, at);
  },

  deny(v: VisitState, reason: string, at: Date = new Date()): VisitPatch {
    return close(v, "Denied", reason, at);
  },

  /** What the host's answer does to the visit. */
  applyReply(v: VisitState, reply: HostReply, at: Date = new Date()): VisitPatch {
    if (!isActive(v.status)) throw conflict("This visit is no longer active, so the reply was not applied.");
    switch (reply) {
      case "Send in":
      case "Reschedule":
        return { reply, repliedAt: at, waitUntil: null };
      case "Wait 10 minutes":
        return { reply, repliedAt: at, waitUntil: new Date(at.getTime() + 10 * 60000) };
      case "Can't meet today":
        return { ...close(v, "Denied", "The host could not meet today", at), reply, repliedAt: at };
    }
  },

  /**
   * A visit left open longer than the office's limit is flagged for review.
   * It is never closed automatically and never given an invented leaving time.
   */
  needsReview(v: Pick<VisitState, "status" | "checkIn">, now: Date = new Date()): boolean {
    if (!isActive(v.status)) return false;
    return now.getTime() - v.checkIn.getTime() > config.office.reviewAfterHours * 3600000;
  },

  /** Only meaningful once both times exist. */
  durationMinutes(v: Pick<VisitState, "checkIn" | "checkOut">): number | null {
    if (!v.checkOut) return null;
    return Math.round((v.checkOut.getTime() - v.checkIn.getTime()) / 60000);
  },

  /** Wellness details stay between the visitor and the host they came to see. */
  hideDetailsFrom(visitorType: VisitorType, viewer: { role: string; hostId: number | null }, visitHostId: number | null): boolean {
    if (visitorType !== "Wellness session") return false;
    if (viewer.role === "manager" || viewer.role === "admin") return false;
    if (viewer.role === "host") return viewer.hostId !== visitHostId;
    return true; // reception sees that it happened, not what it was about
  }
};

function close(v: VisitState, status: "Cancelled" | "Denied", reason: string, at: Date): VisitPatch {
  if (!isActive(v.status)) throw badRequest(`Only an open visit can be marked ${status.toLowerCase()}.`);
  const trimmed = (reason ?? "").trim();
  if (!trimmed) throw badRequest(`Marking a visit ${status.toLowerCase()} needs a reason.`);
  return { status, reason: trimmed, checkOut: at };
}
