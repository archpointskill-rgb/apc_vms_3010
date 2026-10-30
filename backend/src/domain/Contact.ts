import { isValidEmail, normaliseMobile } from "../lib/phone";
import { badRequest } from "../lib/errors";

export interface ContactFields {
  fullName: string;
  mobile: string;
  email?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  organisation?: string | null;
  designation?: string | null;
  notes?: string | null;
}

export interface CleanContact extends ContactFields {
  mobile: string;
  email: string | null;
  dateOfBirth: string | null;
}

export type DuplicateReason = "mobile" | "email" | "name";

/**
 * The rules a contact must satisfy before it can be saved.
 * A visitor needs only a name and a mobile number; email and date of birth
 * become mandatory only when the contact is promoted to a PR contact.
 */
export const Contact = {
  clean(input: ContactFields, today: Date = new Date()): CleanContact {
    const fullName = (input.fullName ?? "").trim();
    if (!fullName) throw badRequest("Enter the visitor's full name.");

    const mobile = normaliseMobile(input.mobile ?? "");
    if (!mobile) throw badRequest("Enter a valid mobile number, for example 98290 00000.");

    const email = input.email?.trim() ? input.email.trim().toLowerCase() : null;
    if (email && !isValidEmail(email)) throw badRequest("That email address does not look right.");

    const dateOfBirth = input.dateOfBirth?.trim() || null;
    if (dateOfBirth) {
      const parsed = new Date(dateOfBirth + "T00:00:00Z");
      if (Number.isNaN(parsed.getTime())) throw badRequest("That date of birth is not a real date.");
      if (parsed.getTime() > today.getTime()) throw badRequest("The date of birth cannot be in the future.");
    }

    return {
      fullName,
      mobile,
      email,
      dateOfBirth,
      address: input.address?.trim() || null,
      organisation: input.organisation?.trim() || null,
      designation: input.designation?.trim() || null,
      notes: input.notes?.trim() || null
    };
  },

  /** "24 May" — what reception is allowed to see of a date of birth. */
  maskBirthday(dateOfBirth: string | null | undefined): string | null {
    if (!dateOfBirth) return null;
    const d = new Date(String(dateOfBirth).slice(0, 10) + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  },

  /** How alike two names are, 0 to 1. Used only to warn, never to merge. */
  nameSimilarity(a: string, b: string): number {
    const x = a.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
    const y = b.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
    if (!x || !y) return 0;
    if (x === y) return 1;
    return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  }
};

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}
