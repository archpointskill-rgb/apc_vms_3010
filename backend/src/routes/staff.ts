import { Router } from "express";
import { z } from "zod";
import { allow, currentUser } from "../auth/middleware";
import { asActor, type Db } from "../db";
import { ROLES } from "../domain/types";
import { badRequest } from "../lib/errors";
import { getStaff, listStaff, updateStaff } from "../repositories/staff";

export function staffRoutes(db: Db) {
  const r = Router();
  r.use(allow("staff.manage"));

  r.get("/", async (_req, res, next) => {
    try { res.json(await listStaff(db)); } catch (e) { next(e); }
  });

  const patchBody = z.object({
    role: z.enum(ROLES).optional(),
    hostId: z.number().int().positive().nullable().optional(),
    active: z.boolean().optional(),
    fullName: z.string().min(1).max(160).optional()
  });

  r.patch("/:id", async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const id = String(req.params.id);
      const patch = patchBody.parse(req.body ?? {});

      // The database refuses this too; saying so here gives a clearer message.
      if (id === viewer.id && (patch.role !== undefined || patch.active !== undefined))
        throw badRequest("You cannot change your own role or switch off your own access. Ask another Admin.");

      const target = await getStaff(db, id);
      if (!target) throw badRequest("That account does not exist.");

      const role = patch.role ?? target.role;
      const hostId = patch.hostId !== undefined ? patch.hostId : target.hostId;
      if (role === "host" && !hostId) throw badRequest("A Host login must be linked to a host.");

      await asActor(db, viewer.id, (c) => updateStaff(c, id, { ...patch, hostId }));
      res.json(await getStaff(db, id));
    } catch (e) { next(e); }
  });

  return r;
}
