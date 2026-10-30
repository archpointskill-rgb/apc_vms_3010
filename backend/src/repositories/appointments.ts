import type { Conn } from "../db";
import { one, query } from "../db";
import type { SignedInUser } from "../auth/middleware";
import type { AppointmentStatus, Purpose, VisitorType } from "../domain/types";
import { notFound } from "../lib/errors";

const SELECT = `
  select a.id, a.guest_name as "guestName", a.guest_mobile as "guestMobile",
         a.visitor_type as "visitorType", a.purpose, a.note, a.status,
         a.starts_at as "startsAt", a.duration_minutes as "durationMinutes",
         a.contact_id as "contactId", c.contact_code as "contactCode",
         h.id as "hostId", h.name as "hostName",
         r.id as "roomId", r.name as "roomName", r.floor as "roomFloor",
         (select v.id from public.visits v where v.appointment_id = a.id limit 1) as "visitId"
    from public.appointments a
    left join public.contacts c on c.id = a.contact_id
    join public.hosts h on h.id = a.host_id
    left join public.rooms r on r.id = a.room_id`;

export interface AppointmentRow {
  id: number; guestName: string; guestMobile: string; visitorType: VisitorType; purpose: Purpose;
  note: string | null; status: AppointmentStatus; startsAt: Date; durationMinutes: number;
  contactId: number | null; contactCode: string | null;
  hostId: number; hostName: string;
  roomId: number | null; roomName: string | null; roomFloor: string | null;
  visitId: number | null;
}

export function listAppointments(c: Conn, viewer: SignedInUser, range: { from: Date; to: Date }) {
  const params: unknown[] = [range.from, range.to];
  let scope = "";
  if (viewer.role === "host") { params.push(viewer.hostId ?? -1); scope = ` and a.host_id = $${params.length}`; }
  return query<AppointmentRow>(
    c,
    `${SELECT} where a.starts_at >= $1 and a.starts_at < $2${scope} order by a.starts_at`,
    params
  );
}

export async function getAppointment(c: Conn, id: number): Promise<AppointmentRow> {
  const row = await one<AppointmentRow>(c, `${SELECT} where a.id = $1`, [id]);
  if (!row) throw notFound("That appointment no longer exists.");
  return row;
}

export async function createAppointment(c: Conn, input: {
  guestName: string; guestMobile: string; hostId: number; visitorType: VisitorType; purpose: Purpose;
  roomId: number | null; startsAt: Date; durationMinutes: number; status: AppointmentStatus;
  contactId: number | null; note: string | null; createdBy: string; isSample?: boolean;
}): Promise<number> {
  const row = await one<{ id: number }>(
    c,
    `insert into public.appointments
       (guest_name, guest_mobile, host_id, visitor_type, purpose, room_id, starts_at, duration_minutes, status, contact_id, note, created_by, is_sample)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [input.guestName, input.guestMobile, input.hostId, input.visitorType, input.purpose, input.roomId,
     input.startsAt, input.durationMinutes, input.status, input.contactId, input.note, input.createdBy, input.isSample ?? false]
  );
  return row!.id;
}

export const setAppointmentStatus = (c: Conn, id: number, status: AppointmentStatus) =>
  query(c, "update public.appointments set status = $2 where id = $1", [id, status]);

export const rescheduleAppointment = (c: Conn, id: number, startsAt: Date, durationMinutes: number, roomId: number | null) =>
  query(
    c,
    "update public.appointments set starts_at = $2, duration_minutes = $3, room_id = coalesce($4, room_id) where id = $1",
    [id, startsAt, durationMinutes, roomId]
  );

/** Two live bookings wanting the same room at the same time, from the database. */
export const roomClashes = (c: Conn, from: Date, to: Date) =>
  query<{ room_id: number; room_name: string; a_id: number; a_label: string; b_id: number; b_label: string }>(
    c,
    "select * from public.room_clashes($1, $2)",
    [from, to]
  );
