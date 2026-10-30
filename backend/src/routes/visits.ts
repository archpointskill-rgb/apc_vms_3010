import { Router } from "express";
import { z } from "zod";
import { allow, allowAny, currentUser } from "../auth/middleware";
import { asActor, type Db } from "../db";
import { can } from "../domain/Permissions";
import { Visit } from "../domain/Visit";
import { HOST_REPLIES, PURPOSES, VISITOR_TYPES, type HostReply } from "../domain/types";
import { startOfOfficeDay } from "../lib/dates";
import { badRequest, forbidden } from "../lib/errors";
import { getSetting, suggestRoomFor } from "../repositories/masters";
import { setAppointmentStatus } from "../repositories/appointments";
import {
  addNotification, applyPatch, assignHost, bumpReminder, createVisit, getVisit,
  listBoard, listNotifications, markNotificationsRead, presentVisit, stateOf
} from "../repositories/visits";
import { sendHostAlert } from "../services/alerts";

const checkInBody = z.object({
  contactId: z.number().int().positive(),
  hostId: z.number().int().positive().nullish(),
  visitorType: z.enum(VISITOR_TYPES),
  purpose: z.enum(PURPOSES),
  remarks: z.string().max(1000).nullish(),
  roomId: z.number().int().positive().nullish(),
  appointmentId: z.number().int().positive().nullish()
});

export function visitRoutes(db: Db) {
  const r = Router();
  r.use(allow("visit.read"));

  r.get("/", async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const rows = await listBoard(db, viewer, startOfOfficeDay());
      res.json(rows.map((row) => presentVisit(row, viewer)));
    } catch (e) { next(e); }
  });

  r.get("/:id", async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const row = await getVisit(db, Number(req.params.id));
      if (viewer.role === "host" && row.hostId !== viewer.hostId) throw forbidden("That visitor is not here to see you.");
      res.json(presentVisit(row, viewer));
    } catch (e) { next(e); }
  });

  /** Check in. The host may be left out: the visit then sits in the Unassigned queue. */
  r.post("/", allow("visit.checkIn"), async (req, res, next) => {
    try {
      const body = checkInBody.parse(req.body ?? {});
      const viewer = currentUser(req);
      const purpose = Visit.purposeFor(body.visitorType, body.purpose);
      const hostId = body.hostId ?? null;

      const suggested = body.roomId ? null : await suggestRoomFor(db, hostId, body.visitorType);
      const roomId = body.roomId ?? suggested?.id ?? null;
      const notice = await getSetting<{ version: string }>(db, "notice");

      const id = await asActor(db, viewer.id, async (c) => {
        const visitId = await createVisit(c, {
          contactId: body.contactId, hostId, visitorType: body.visitorType, purpose,
          remarks: body.remarks ?? null, roomId, appointmentId: body.appointmentId ?? null,
          noticeVersion: notice?.version ?? null, createdBy: viewer.id
        });
        // An approved appointment that the visitor has now arrived for is done with.
        if (body.appointmentId) await setAppointmentStatus(c, body.appointmentId, "Approved");
        return visitId;
      });

      const row = await getVisit(db, id);
      // The in-app alert is written by the database; this is the WhatsApp extra.
      void sendHostAlert(db, {
        event: "visitor.waiting", visitId: row.id, visitorName: row.contactName, visitorMobile: row.contactMobile,
        organisation: row.contactOrg, visitorType: row.visitorType, purpose: row.purpose,
        hostName: row.hostName, hostMobile: row.hostMobile, room: row.roomName, floor: row.roomFloor,
        checkInAt: row.checkIn.toISOString()
      });
      res.status(201).json(presentVisit(row, viewer));
    } catch (e) { next(e); }
  });

  /** One place for every status change, so the rules cannot be skipped. */
  const transition = (
    name: string,
    decide: (state: ReturnType<typeof stateOf>, body: any) => ReturnType<typeof Visit.startMeeting>
  ) =>
    async (req: any, res: any, next: any) => {
      try {
        const viewer = currentUser(req);
        if (!can(viewer.role, "visit.manage")) throw forbidden(`Your role cannot ${name} a visit.`);
        const row = await getVisit(db, Number(req.params.id));
        const patch = decide(stateOf(row), req.body ?? {});
        await asActor(db, viewer.id, (c) => applyPatch(c, row.id, patch));
        res.json(presentVisit(await getVisit(db, row.id), viewer));
      } catch (e) { next(e); }
    };

  r.post("/:id/start", transition("start", (state) => Visit.startMeeting(state)));
  r.post("/:id/check-out", transition("check out", (state) => Visit.checkOut(state)));
  r.post("/:id/cancel", transition("cancel", (state, body) => Visit.cancel(state, String(body.reason ?? ""))));
  r.post("/:id/deny", transition("deny", (state, body) => Visit.deny(state, String(body.reason ?? ""))));

  /** The host's own answer. Reception may record it on their behalf. */
  r.post("/:id/reply", allowAny("visit.reply", "visit.manage"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const reply = String(req.body?.reply ?? "") as HostReply;
      if (!(HOST_REPLIES as readonly string[]).includes(reply)) throw badRequest("That is not one of the replies.");

      const row = await getVisit(db, Number(req.params.id));
      if (viewer.role === "host" && row.hostId !== viewer.hostId) throw forbidden("That visitor is not here to see you.");

      const patch = Visit.applyReply(stateOf(row), reply);
      await asActor(db, viewer.id, (c) => applyPatch(c, row.id, patch));
      res.json(presentVisit(await getVisit(db, row.id), viewer));
    } catch (e) { next(e); }
  });

  /** Give an Unassigned visitor a host, and the room the rules suggest. */
  r.post("/:id/assign", allow("visit.manage"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const hostId = Number(req.body?.hostId);
      if (!Number.isInteger(hostId) || hostId <= 0) throw badRequest("Choose a host.");
      const row = await getVisit(db, Number(req.params.id));
      const suggested = req.body?.roomId ? { id: Number(req.body.roomId) } : await suggestRoomFor(db, hostId, row.visitorType);

      await asActor(db, viewer.id, async (c) => {
        await assignHost(c, row.id, hostId, suggested?.id ?? null);
        await addNotification(c, hostId, row.id, `${row.contactName} is waiting at reception.`);
      });
      const updated = await getVisit(db, row.id);
      void sendHostAlert(db, {
        event: "visitor.waiting", visitId: updated.id, visitorName: updated.contactName, visitorMobile: updated.contactMobile,
        organisation: updated.contactOrg, visitorType: updated.visitorType, purpose: updated.purpose,
        hostName: updated.hostName, hostMobile: updated.hostMobile, room: updated.roomName, floor: updated.roomFloor,
        checkInAt: updated.checkIn.toISOString()
      });
      res.json(presentVisit(updated, viewer));
    } catch (e) { next(e); }
  });

  r.post("/:id/remind", allow("visit.manage"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const row = await getVisit(db, Number(req.params.id));
      if (!row.hostId) throw badRequest("Give this visitor a host first.");
      await asActor(db, viewer.id, async (c) => {
        await bumpReminder(c, row.id);
        await addNotification(c, row.hostId!, row.id, `Reminder: ${row.contactName} is still waiting.`);
      });
      void sendHostAlert(db, {
        event: "visitor.reminder", visitId: row.id, visitorName: row.contactName, visitorMobile: row.contactMobile,
        organisation: row.contactOrg, visitorType: row.visitorType, purpose: row.purpose,
        hostName: row.hostName, hostMobile: row.hostMobile, room: row.roomName, floor: row.roomFloor,
        checkInAt: row.checkIn.toISOString()
      });
      res.json(presentVisit(await getVisit(db, row.id), viewer));
    } catch (e) { next(e); }
  });

  return r;
}

export function notificationRoutes(db: Db) {
  const r = Router();
  r.get("/", async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      res.json(viewer.hostId ? await listNotifications(db, viewer.hostId) : []);
    } catch (e) { next(e); }
  });
  r.post("/read", async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      if (viewer.hostId) await asActor(db, viewer.id, (c) => markNotificationsRead(c, viewer.hostId!));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  return r;
}
