import type { Conn } from "../db";
import { one, query } from "../db";
import { Contact, type CleanContact, type DuplicateReason } from "../domain/Contact";
import { can } from "../domain/Permissions";
import type { Role } from "../domain/types";

/** Every column except date_of_birth, which is handed out separately by role. */
const COLUMNS = `c.id, c.contact_code as code, c.full_name as "fullName", c.mobile, c.email,
                 c.address, c.organisation, c.designation, c.notes,
                 c.is_pr_contact as "isPrContact", c.is_sample as "isSample", c.created_at as "createdAt"`;

const WITH_STATS = `
  select ${COLUMNS}, c.date_of_birth as "dateOfBirth",
         (select count(*)::int from public.visits v where v.contact_id = c.id) as "visitCount",
         (select max(v.check_in) from public.visits v where v.contact_id = c.id) as "lastVisit"
    from public.contacts c`;

export interface ContactRecord {
  id: number; code: string; fullName: string; mobile: string; email: string | null;
  dateOfBirth: string | Date | null; address: string | null; organisation: string | null;
  designation: string | null; notes: string | null; isPrContact: boolean; isSample: boolean;
  createdAt: Date; visitCount?: number; lastVisit?: Date | null;
}

/** Reception never receives a full date of birth, only the day and month. */
export function presentContact(row: ContactRecord, role: Role) {
  const dob = row.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : null;
  const { dateOfBirth: _ignored, ...rest } = row;
  return { ...rest, dateOfBirth: can(role, "contact.viewFullDob") ? dob : null, birthday: Contact.maskBirthday(dob) };
}

export async function searchContacts(c: Conn, term: string, limit = 50): Promise<ContactRecord[]> {
  const q = term.trim();
  if (!q) return query<ContactRecord>(c, `${WITH_STATS} order by c.id desc limit $1`, [limit]);
  return query<ContactRecord>(
    c,
    `${WITH_STATS}
      where c.full_name ilike $1 or c.mobile like $1 or c.email ilike $1
         or c.contact_code ilike $1 or c.organisation ilike $1
      order by c.full_name limit $2`,
    [`%${q}%`, limit]
  );
}

export const getContact = (c: Conn, id: number) =>
  one<ContactRecord>(c, `${WITH_STATS} where c.id = $1`, [id]);

export const contactVisits = (c: Conn, id: number) =>
  query(
    c,
    `select v.id, v.check_in as "checkIn", v.check_out as "checkOut", v.status,
            v.visitor_type as "visitorType", v.purpose, h.name as "hostName"
       from public.visits v left join public.hosts h on h.id = v.host_id
      where v.contact_id = $1 order by v.check_in desc limit 100`,
    [id]
  );

export interface Duplicate {
  id: number; code: string; fullName: string; mobile: string; organisation: string | null; reason: DuplicateReason;
}

/**
 * Warns about a contact that may already exist: the same mobile number, the
 * same email, or a very similar name. Nothing is ever merged automatically —
 * reception decides.
 */
export async function findDuplicates(c: Conn, candidate: CleanContact, excludeId?: number): Promise<Duplicate[]> {
  const exact = await query<Omit<Duplicate, "reason">>(
    c,
    `select c.id, c.contact_code as code, c.full_name as "fullName", c.mobile, c.organisation
       from public.contacts c
      where ($3::bigint is null or c.id <> $3)
        and (c.mobile = $1 or ($2::text is not null and c.email is not null and lower(c.email) = $2))`,
    [candidate.mobile, candidate.email, excludeId ?? null]
  );
  const byMobileOrEmail: Duplicate[] = exact.map((r) => ({ ...r, reason: r.mobile === candidate.mobile ? "mobile" : "email" }));
  const seen = new Set(byMobileOrEmail.map((d) => d.id));

  // A similar name only matters among people whose name starts the same way,
  // so the comparison stays cheap as the list grows.
  const prefix = candidate.fullName.trim().slice(0, 3);
  const nearby = await query<Omit<Duplicate, "reason">>(
    c,
    `select c.id, c.contact_code as code, c.full_name as "fullName", c.mobile, c.organisation
       from public.contacts c
      where ($2::bigint is null or c.id <> $2) and c.full_name ilike $1 limit 200`,
    [`${prefix}%`, excludeId ?? null]
  );
  for (const row of nearby) {
    if (seen.has(row.id)) continue;
    if (Contact.nameSimilarity(candidate.fullName, row.fullName) >= 0.85) byMobileOrEmail.push({ ...row, reason: "name" });
  }
  return byMobileOrEmail;
}

export async function insertContact(c: Conn, data: CleanContact, createdBy: string, isSample = false) {
  const row = await one<{ id: number }>(
    c,
    `insert into public.contacts (full_name, mobile, email, date_of_birth, address, organisation, designation, notes, created_by, updated_by, is_sample)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10) returning id`,
    [data.fullName, data.mobile, data.email, data.dateOfBirth, data.address ?? null,
     data.organisation ?? null, data.designation ?? null, data.notes ?? null, createdBy, isSample]
  );
  return row!.id;
}

export async function updateContact(c: Conn, id: number, data: CleanContact, isPrContact?: boolean) {
  await query(
    c,
    `update public.contacts
        set full_name = $2, mobile = $3, email = $4, date_of_birth = $5, address = $6,
            organisation = $7, designation = $8, notes = $9,
            is_pr_contact = coalesce($10, is_pr_contact)
      where id = $1`,
    [id, data.fullName, data.mobile, data.email, data.dateOfBirth, data.address ?? null,
     data.organisation ?? null, data.designation ?? null, data.notes ?? null, isPrContact ?? null]
  );
}
