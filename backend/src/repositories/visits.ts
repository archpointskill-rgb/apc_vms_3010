import type { Conn } from "../db";
import { one, query } from "../db";
import type { SignedInUser } from "../auth/middleware";
import { Visit, type VisitPatch, type VisitState } from "../domain/Visit";
import type { HostReply, Purpose, VisitStatus, VisitorType } from "../domain/types";
import { notFound } from "../lib/errors";

const SELECT = `
  select v.id, v.status, v.visitor_type as "visitorType", v.purpose, v.remarks,
         v.check_in as "checkIn", v.check_out as "checkOut", v.reason,
         v.reply, v.replied_at as "repliedAt", v.wait_until as "waitUntil",
         v.reminders, v.appointment_id as "appointmentId", v.is_sample as "isSample",
         c.id as "contactId", c.contact_code as "contactCode", c.full_name as "contactName",
         c.mobile as "contactMobile", c.organisation as "contactOrg", c.email as "contactEmail",
         h.id as "hostId", h.name as "hostName", h.mobile as "hostMobile",
         r.id as "roomId", r.name as "roomName", r.floor as "roomFloor"
    from public.visits v
    join public.contacts c on c.id = v.contact_id
    left join public.hosts h on h.id = v.host_id
    left join public.rooms r on r.id = v.room_id`;

export interface VisitRow {
  id: number; status: VisitStatus; visitorType: VisitorType; purpose: Purpose; remarks: string | null;
  checkIn: Date; checkOut: Date | null; reason: string | null; reply: HostReply | null;
  repliedAt: Date | null; waitUntil: Date | null; reminders: number; appointmentId: number | null; isSample: boolean;
  contactId: number; contactCode: string; contactName: string; contactMobile: string;
  contactOrg: string | null; contactEmail: string | null;
  hostId: number | null; hostName: string | null; hostMobile: string | null;
  roomId: number | null; roomName: string | null; roomFloor: string | null;
}

export const stateOf = (row: VisitRow): VisitState => ({
  status: row.status, checkIn: row.checkIn, checkOut: row.checkOut, reason: row.reason,
  reply: row.reply, repliedAt: row.repliedAt, waitUntil: row.waitUntil
});

/** Shapes a visit for the screens, hiding what the viewer may not see. */
export function presentVisit(row: VisitRow, viewer: SignedInUser, now = new Date()) {
  const hide = Visit.hideDetailsFrom(row.visitorType, viewer, row.hostId);
  return {
    id: row.id,
    status: row.status,
    visitorType: row.visitorType,
    purpose: row.purpose,
    remarks: hide ? null : row.remarks,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    reason: row.reason,
    reply: row.reply,
    repliedAt: row.repliedAt,
    waitUntil: row.waitUntil,
    reminders: row.reminders,
    appointmentId: row.appointmentId,
    isSample: row.isSample,
    durationMinutes: Visit.durationMinutes(row),
    needsReview: Visit.needsReview(row, now),
    unassigned: row.hostId === null,
    contact: {
      id: row.contactId, code: row.contactCode, name: row.contactName,
      mobile: row.contactMobile, organisation: row.contactOrg
    },
    host: row.hostId === null ? null : { id: row.hostId, name: row.hostName },
    room: row.roomId === null ? null : { id: row.roomId, name: row.roomName, floor: row.roomFloor }
  };
}

/** A host only ever sees the visits addressed to them. */
const scopeFor = (viewer: SignedInUser) =>
  viewer.role === "host" ? { clause: "v.host_id = $1", params: [viewer.hostId ?? -1] } : { clause: "true", params: [] as unknown[] };

export async function listBoard(c: Conn, viewer: SignedInUser, dayStart: Date): Promise<VisitRow[]> {
  const scope = scopeFor(viewer);
  return query<VisitRow>(
    c,
    `${SELECT} where ${scope.clause}
       and (v.status in ('Waiting','In meeting') or v.check_in >= $${scope.params.length + 1})
     order by v.check_in`,
    [...scope.params, dayStart]
  );
}

export async function listVisits(c: Conn, viewer: SignedInUser, filters: {
  from?: Date; to?: Date; hostId?: number; status?: VisitStatus; visitorType?: VisitorType; limit?: number;
}): Promise<VisitRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.split("?").join(`$${params.length}`)); };

  if (viewer.role === "host") add("v.host_id = ?", viewer.hostId ?? -1);
  if (filters.from) add("v.check_in >= ?", filters.from);
  if (filters.to) add("v.check_in < ?", filters.to);
  if (filters.hostId) add("v.host_id = ?", filters.hostId);
  if (filters.status) add("v.status = ?", filters.status);
  if (filters.visitorType) add("v.visitor_type = ?", filters.visitorType);

  params.push(Math.min(filters.limit ?? 500, 5000));
  return query<VisitRow>(
    c,
    `${SELECT} ${where.length ? "where " + where.join(" and ") : ""} order by v.check_in desc limit $${params.length}`,
    params
  );
}

export async function getVisit(c: Conn, id: number): Promise<VisitRow> {
  const row = await one<VisitRow>(c, `${SELECT} where v.id = $1`, [id]);
  if (!row) throw notFound("That visit no longer exists.");
  return row;
}

export async function createVisit(c: Conn, input: {
  contactId: number; hostId: number | null; visitorType: VisitorType; purpose: Purpose;
  remarks: string | null; roomId: number | null; appointmentId: number | null;
  noticeVersion: string | null; createdBy: string; isSample?: boolean;
}): Promise<number> {
  const row = await one<{ id: number }>(
    c,
    `insert into public.visits
       (contact_id, host_id, visitor_type, purpose, remarks, room_id, appointment_id, notice_version, notice_ack_at, created_by, is_sample)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10) returning id`,
    [input.contactId, input.hostId, input.visitorType, input.purpose, input.remarks, input.roomId,
     input.appointmentId, input.noticeVersion, input.createdBy, input.isSample ?? false]
  );
  return row!.id;
}

/** Writes exactly the fields a domain transition asked to change. */
export async function applyPatch(c: Conn, id: number, patch: VisitPatch): Promise<void> {
  const columns: Record<keyof VisitPatch, string> = {
    status: "status", checkIn: "check_in", checkOut: "check_out", reason: "reason",
    reply: "reply", repliedAt: "replied_at", waitUntil: "wait_until"
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns) as [keyof VisitPatch, string][]) {
    if (key in patch) { params.push(patch[key] ?? null); sets.push(`${column} = $${params.length}`); }
  }
  if (!sets.length) return;
  await query(c, `update public.visits set ${sets.join(", ")} where id = $1`, params);
}

export const assignHost = (c: Conn, id: number, hostId: number, roomId: number | null) =>
  query(c, "update public.visits set host_id = $2, room_id = coalesce($3, room_id) where id = $1", [id, hostId, roomId]);

export const bumpReminder = (c: Conn, id: number) =>
  query(c, "update public.visits set reminders = reminders + 1 where id = $1", [id]);

export const addNotification = (c: Conn, hostId: number, visitId: number, body: string) =>
  query(c, "insert into public.notifications (host_id, visit_id, body) values ($1, $2, $3)", [hostId, visitId, body]);

export const listNotifications = (c: Conn, hostId: number) =>
  query(
    c,
    `select id, visit_id as "visitId", body, created_at as "createdAt", read_at as "readAt"
       from public.notifications where host_id = $1 order by id desc limit 30`,
    [hostId]
  );

export const markNotificationsRead = (c: Conn, hostId: number) =>
  query(c, "update public.notifications set read_at = now() where host_id = $1 and read_at is null", [hostId]);
