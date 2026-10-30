import { Router } from "express";
import { z } from "zod";
import { allow, currentUser } from "../auth/middleware";
import { asActor, type Db } from "../db";
import { Appointment } from "../domain/Appointment";
import { can } from "../domain/Permissions";
import { PURPOSES, VISITOR_TYPES } from "../domain/types";
import { addDays, officeDayStart, officeDateString } from "../lib/dates";
import { badRequest, forbidden } from "../lib/errors";
import { normaliseMobile } from "../lib/phone";
import {
  createAppointment, getAppointment, listAppointments, rescheduleAppointment, roomClashes, setAppointmentStatus
} from "../repositories/appointments";
import { suggestRoomFor } from "../repositories/masters";

const bookingBody = z.object({
  guestName: z.string().min(1).max(160),
  guestMobile: z.string().min(4).max(25),
  hostId: z.number().int().positive(),
  visitorType: z.enum(VISITOR_TYPES),
  purpose: z.enum(PURPOSES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(5).max(600).default(60),
  roomId: z.number().int().positive().nullish(),
  contactId: z.number().int().positive().nullish(),
  note: z.string().max(1000).nullish()
});

export function appointmentRoutes(db: Db) {
  const r = Router();
  r.use(allow("appointment.read"));

  /** A day, or a range. Defaults to the next two weeks from today. */
  r.get("/", async (req, res, next) => {
    try {
      const fromDate = String(req.query.from ?? officeDateString());
      const from = officeDayStart(fromDate);
      const to = req.query.to ? addDays(officeDayStart(String(req.query.to)), 1) : addDays(from, 14);
      const viewer = currentUser(req);
      const [items, clashes] = await Promise.all([
        listAppointments(db, viewer, { from, to }),
        roomClashes(db, from, to)
      ]);
      res.json({
        items,
        clashes: clashes.map((c) => ({
          roomId: c.room_id, roomName: c.room_name,
          first: { id: c.a_id, label: c.a_label }, second: { id: c.b_id, label: c.b_label }
        }))
      });
    } catch (e) { next(e); }
  });

  /** The meeting-day view: one day in the Board room order, with any clash. */
  r.get("/day/:date", async (req, res, next) => {
    try {
      const date = String(req.params.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Use a date like 2026-11-03.");
      const from = officeDayStart(date);
      const to = addDays(from, 1);
      const viewer = currentUser(req);
      const [items, clashes] = await Promise.all([
        listAppointments(db, viewer, { from, to }),
        roomClashes(db, from, to)
      ]);
      res.json({
        date,
        items,
        clashes: clashes.map((c) => ({
          roomId: c.room_id, roomName: c.room_name,
          first: { id: c.a_id, label: c.a_label }, second: { id: c.b_id, label: c.b_label }
        }))
      });
    } catch (e) { next(e); }
  });

  r.post("/", allow("appointment.book"), async (req, res, next) => {
    try {
      const body = bookingBody.parse(req.body ?? {});
      const viewer = currentUser(req);
      if (viewer.role === "host" && body.hostId !== viewer.hostId)
        throw forbidden("A host can only book appointments for themselves.");

      const mobile = normaliseMobile(body.guestMobile);
      if (!mobile) throw badRequest("Enter a valid mobile number for the guest.");

      const startsAt = Appointment.parseStart(body.date, body.time);
      const suggested = body.roomId ? null : await suggestRoomFor(db, body.hostId, body.visitorType);

      // A host booking their own time does not need to approve it afterwards.
      const status = viewer.role === "host" ? "Approved" : "Pending approval";

      const id = await asActor(db, viewer.id, (c) =>
        createAppointment(c, {
          guestName: body.guestName.trim(), guestMobile: mobile, hostId: body.hostId,
          visitorType: body.visitorType, purpose: body.purpose,
          roomId: body.roomId ?? suggested?.id ?? null, startsAt,
          durationMinutes: body.durationMinutes, status, contactId: body.contactId ?? null,
          note: body.note ?? null, createdBy: viewer.id
        })
      );
      res.status(201).json(await getAppointment(db, id));
    } catch (e) { next(e); }
  });

  const decide = (status: "Approved" | "Declined") => async (req: any, res: any, next: any) => {
    try {
      const viewer = currentUser(req);
      const appointment = await getAppointment(db, Number(req.params.id));
      // A host answers only their own bookings; reception cannot answer at all.
      const allowed = viewer.role === "host"
        ? appointment.hostId === viewer.hostId
        : can(viewer.role, "appointment.decide");
      if (!allowed) throw forbidden("Only the host it is booked with, a manager or the Admin can answer a booking.");
      await asActor(db, viewer.id, (c) => setAppointmentStatus(c, appointment.id, status));
      res.json(await getAppointment(db, appointment.id));
    } catch (e) { next(e); }
  };

  r.post("/:id/approve", decide("Approved"));
  r.post("/:id/decline", decide("Declined"));

  /** Reception moves a slot on the meeting-day timeline. */
  r.patch("/:id", allow("appointment.book"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const appointment = await getAppointment(db, Number(req.params.id));
      if (viewer.role === "host" && appointment.hostId !== viewer.hostId)
        throw forbidden("That is not your appointment.");

      const body = z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        durationMinutes: z.number().int().min(5).max(600).optional(),
        roomId: z.number().int().positive().nullish()
      }).parse(req.body ?? {});

      const current = appointment.startsAt;
      const date = body.date ?? officeDateString(current);
      const time = body.time ?? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false
      }).format(current);

      await asActor(db, viewer.id, (c) =>
        rescheduleAppointment(c, appointment.id, Appointment.parseStart(date, time),
          body.durationMinutes ?? appointment.durationMinutes, body.roomId ?? null)
      );
      res.json(await getAppointment(db, appointment.id));
    } catch (e) { next(e); }
  });

  return r;
}
