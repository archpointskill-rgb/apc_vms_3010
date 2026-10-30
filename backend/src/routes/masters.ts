import { Router } from "express";
import { z } from "zod";
import { allow, currentUser } from "../auth/middleware";
import { asActor, type Db, query } from "../db";
import { VISITOR_TYPES } from "../domain/types";
import { badRequest } from "../lib/errors";
import { normaliseMobile } from "../lib/phone";
import { getSetting, listHosts, listRooms, listRules, putSetting, suggestRoomFor } from "../repositories/masters";

export function masterRoutes(db: Db) {
  const r = Router();

  r.get("/hosts", async (req, res, next) => {
    try {
      res.json(await listHosts(db, currentUser(req).role === "admin"));
    } catch (e) { next(e); }
  });

  r.get("/rooms", async (req, res, next) => {
    try { res.json(await listRooms(db, currentUser(req).role === "admin")); } catch (e) { next(e); }
  });

  r.get("/rules", async (_req, res, next) => {
    try { res.json(await listRules(db)); } catch (e) { next(e); }
  });

  r.get("/notice", async (_req, res, next) => {
    try { res.json(await getSetting(db, "notice")); } catch (e) { next(e); }
  });

  /** What the check-in form shows before anything is saved. */
  r.get("/suggest-room", async (req, res, next) => {
    try {
      const visitorType = String(req.query.visitorType ?? "");
      if (!(VISITOR_TYPES as readonly string[]).includes(visitorType)) throw badRequest("Choose a visitor type.");
      const hostId = req.query.hostId ? Number(req.query.hostId) : null;
      res.json(await suggestRoomFor(db, hostId, visitorType as never));
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- admin
  const hostPatch = z.object({
    designation: z.string().max(120).nullish(),
    department: z.string().max(120).nullish(),
    floor: z.enum(["Ground", "2nd", "3rd"]).optional(),
    defaultRoomId: z.number().int().positive().nullish(),
    mobile: z.string().max(25).nullish(),
    email: z.string().max(200).nullish(),
    active: z.boolean().optional()
  });

  r.patch("/hosts/:id", allow("master.manage"), async (req, res, next) => {
    try {
      const patch = hostPatch.parse(req.body ?? {});
      let mobile: string | null | undefined;
      if (patch.mobile !== undefined) {
        mobile = patch.mobile ? normaliseMobile(patch.mobile) : null;
        if (patch.mobile && !mobile) throw badRequest("Enter a valid mobile number for the host, or leave it blank.");
      }
      await asActor(db, currentUser(req).id, (c) =>
        query(
          c,
          `update public.hosts
              set designation = coalesce($2, designation), department = coalesce($3, department),
                  floor = coalesce($4, floor), default_room_id = coalesce($5, default_room_id),
                  mobile = case when $6::boolean then $7 else mobile end,
                  email = coalesce($8, email), active = coalesce($9, active)
            where id = $1`,
          [Number(req.params.id), patch.designation ?? null, patch.department ?? null, patch.floor ?? null,
           patch.defaultRoomId ?? null, mobile !== undefined, mobile ?? null, patch.email ?? null, patch.active ?? null]
        )
      );
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.put("/settings/:key", allow("settings.manage"), async (req, res, next) => {
    try {
      await asActor(db, currentUser(req).id, (c) => putSetting(c, String(req.params.key), req.body ?? {}));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.get("/settings/:key", async (req, res, next) => {
    try { res.json(await getSetting(db, String(req.params.key))); } catch (e) { next(e); }
  });

  return r;
}
