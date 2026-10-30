/** An error whose message is safe to show the person using the app. */
export class AppError extends Error {
  constructor(message: string, readonly status = 400, readonly extra?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (m: string, extra?: Record<string, unknown>) => new AppError(m, 400, extra);
export const unauthorized = (m = "Please sign in.") => new AppError(m, 401);
export const forbidden = (m = "Your role cannot do this.") => new AppError(m, 403);
export const notFound = (m = "Not found.") => new AppError(m, 404);
export const conflict = (m: string, extra?: Record<string, unknown>) => new AppError(m, 409, extra);

/** Turns the database's own complaints into something a receptionist can act on. */
export function translateDbError(e: unknown): AppError | null {
  const err = e as { code?: string; constraint?: string; message?: string };
  if (!err?.code) return null;
  if (err.code === "23505") {
    if (err.constraint === "visits_one_active_per_contact")
      return conflict("This visitor is already checked in. Check them out before starting a new visit.");
    if (err.constraint === "contacts_contact_code_key") return conflict("That contact code is already used.");
    if (err.constraint === "hosts_name_key") return conflict("A host with that name already exists.");
    if (err.constraint === "rooms_name_key") return conflict("A room with that name already exists.");
    return conflict("That record already exists.");
  }
  if (err.code === "23514") {
    const byConstraint: Record<string, string> = {
      checkout_not_before_checkin: "The check-out time cannot be before the check-in time.",
      closed_states_need_a_reason: "Cancelling or denying a visit needs a reason.",
      open_states_have_no_checkout: "An open visit cannot have a check-out time.",
      wellness_purpose_is_fixed: "A wellness visit records its purpose only as 'Wellness session'.",
      pr_contact_needs_email_and_dob: "A PR contact needs both an email address and a date of birth.",
      host_login_needs_host: "A Host login must be linked to a host.",
      contacts_mobile_check: "Enter a valid mobile number.",
      contacts_date_of_birth_check: "The date of birth cannot be in the future."
    };
    const message = err.constraint ? byConstraint[err.constraint] : undefined;
    return badRequest(message ?? "That change breaks one of the office rules.");
  }
  if (err.code === "23503") return badRequest("That record refers to something that does not exist.");
  if (err.code === "P0001" || err.code === "42501") return badRequest(err.message ?? "That is not allowed.");
  return null;
}
