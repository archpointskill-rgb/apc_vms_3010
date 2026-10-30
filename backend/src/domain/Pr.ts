import { badRequest } from "../lib/errors";
import type { PrCategory, PrStatus, TaskStatus } from "./types";

export const PrProfile = {
  /** A relationship always sits in at least one category; unclassified means Other. */
  tidyCategories(input: unknown): PrCategory[] {
    const list = Array.isArray(input) ? (input as PrCategory[]) : [];
    const unique = [...new Set(list.filter(Boolean))];
    if (unique.length > 10) throw badRequest("Choose up to ten categories.");
    return unique.length ? unique : ["Other"];
  },

  tidyTags(input: unknown): string[] {
    const list = Array.isArray(input) ? input.map((t) => String(t).trim()).filter(Boolean) : [];
    const unique = [...new Set(list)];
    if (unique.length > 25) throw badRequest("Twenty-five tags is the limit.");
    if (unique.some((t) => t.length > 40)) throw badRequest("A tag can be forty characters at most.");
    return unique;
  },

  /**
   * Whether the office may send this person a promotional message.
   * A visit, a birthday on file or a PR profile is never permission on its own.
   */
  mayContact(status: PrStatus, optedIn: boolean | null | undefined): boolean {
    if (status === "Do not contact" || status === "Archived") return false;
    return optedIn === true;
  }
};

export const PrTask = {
  isOpen: (status: TaskStatus) => status === "Open" || status === "In progress",

  isOverdue(status: TaskStatus, dueOn: string, today = new Date()): boolean {
    if (!PrTask.isOpen(status)) return false;
    return dueOn < today.toISOString().slice(0, 10);
  },

  validateDue(dueOn: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn ?? "")) throw badRequest("Choose a date for the follow-up.");
    return dueOn;
  }
};
