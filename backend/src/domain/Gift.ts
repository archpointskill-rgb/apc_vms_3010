import { badRequest, forbidden } from "../lib/errors";
import type { GiftDirection, GiftStatus } from "./types";

export interface GiftState {
  direction: GiftDirection;
  status: GiftStatus;
  createdBy: string | null;
  approvedBy: string | null;
}

export interface GiftPatch {
  status?: GiftStatus;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  decisionNote?: string | null;
  actualValue?: number | null;
  completedOn?: string | null;
}

const FINISHED: readonly GiftStatus[] = ["Delivered", "Received", "Cancelled", "Returned"];

/**
 * How a gift record moves along.
 *
 * The office's rule: every outgoing gift waits for a manager, and nobody may
 * approve a gift they proposed themselves. An incoming gift is not approved but
 * acknowledged, which the same people do. The database repeats both rules, so
 * they hold even for somebody writing SQL by hand.
 */
export const Gift = {
  /** An outgoing gift is never simply "planned": it needs a decision first. */
  statusWhenProposed(direction: GiftDirection): GiftStatus {
    return direction === "Given" ? "Pending approval" : "Planned";
  },

  isFinished: (status: GiftStatus) => FINISHED.includes(status),

  approve(gift: GiftState, approverId: string, note?: string): GiftPatch {
    if (gift.direction !== "Given") throw badRequest("Only an outgoing gift is approved. An incoming one is acknowledged.");
    if (gift.status !== "Pending approval") throw badRequest(`A gift that is ${gift.status.toLowerCase()} cannot be approved.`);
    if (gift.createdBy && gift.createdBy === approverId)
      throw forbidden("You proposed this gift, so somebody else has to approve it.");
    return { status: "Approved", approvedBy: approverId, approvedAt: new Date(), decisionNote: note?.trim() || null };
  },

  decline(gift: GiftState, approverId: string, reason: string): GiftPatch {
    if (Gift.isFinished(gift.status)) throw badRequest("This gift record is already closed.");
    if (gift.createdBy && gift.createdBy === approverId)
      throw forbidden("You proposed this gift, so somebody else has to decide on it.");
    if (!reason?.trim()) throw badRequest("Declining a gift needs a reason.");
    return { status: "Cancelled", approvedBy: approverId, approvedAt: new Date(), decisionNote: reason.trim() };
  },

  /** An incoming gift is recorded, then a manager acknowledges it. */
  acknowledge(gift: GiftState, approverId: string, actualValue: number, completedOn: string): GiftPatch {
    if (gift.direction !== "Received") throw badRequest("Only an incoming gift is acknowledged.");
    if (Gift.isFinished(gift.status)) throw badRequest("This gift record is already closed.");
    return {
      status: "Received", approvedBy: approverId, approvedAt: new Date(),
      actualValue: check(actualValue), completedOn: day(completedOn)
    };
  },

  dispatch(gift: GiftState): GiftPatch {
    if (gift.status !== "Approved") throw badRequest("A gift has to be approved before it goes out.");
    return { status: "Dispatched" };
  },

  /** What it really cost, and the day it actually happened. */
  complete(gift: GiftState, actualValue: number, completedOn: string): GiftPatch {
    if (gift.direction !== "Given") throw badRequest("Use acknowledge for an incoming gift.");
    if (!["Approved", "Dispatched"].includes(gift.status))
      throw badRequest("Only an approved gift can be marked delivered.");
    return { status: "Delivered", actualValue: check(actualValue), completedOn: day(completedOn) };
  },

  cancel(gift: GiftState, reason: string): GiftPatch {
    if (Gift.isFinished(gift.status)) throw badRequest("This gift record is already closed.");
    if (!reason?.trim()) throw badRequest("Cancelling a gift needs a reason.");
    return { status: "Cancelled", decisionNote: reason.trim() };
  },

  markReturned(gift: GiftState, reason: string): GiftPatch {
    if (gift.status !== "Delivered" && gift.status !== "Received")
      throw badRequest("Only a gift that arrived can be returned.");
    if (!reason?.trim()) throw badRequest("Recording a return needs a reason.");
    return { status: "Returned", decisionNote: reason.trim() };
  }
};

function check(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw badRequest("Enter what the gift actually cost, or zero.");
  return Math.round(value * 100) / 100;
}

function day(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw badRequest("Enter the date it actually happened.");
  return value;
}
