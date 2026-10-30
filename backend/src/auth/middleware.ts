import type { NextFunction, Request, Response } from "express";
import type { Db } from "../db";
import { one } from "../db";
import { can, type Action } from "../domain/Permissions";
import type { Role } from "../domain/types";
import { forbidden, unauthorized } from "../lib/errors";
import type { TokenVerifier } from "./verifier";

export interface SignedInUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  hostId: number | null;
  hostName: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: SignedInUser;
  }
}

/** The signed-in person. Only call this behind `authenticate`. */
export function currentUser(req: Request): SignedInUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/**
 * Reads the bearer token, checks it with Supabase, then loads the staff record
 * fresh on every request, so a role change or a switched-off account takes
 * effect at once instead of when the token expires.
 */
export function authenticate(db: Db, verifier: TokenVerifier) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (!token) throw unauthorized();

      let verified;
      try {
        verified = await verifier.verify(token);
      } catch {
        throw unauthorized("Your session has expired. Please sign in again.");
      }

      const staff = await one<{
        id: string; email: string; full_name: string; role: Role; host_id: number | null; active: boolean; host_name: string | null;
      }>(
        db,
        `select s.id, s.email, s.full_name, s.role, s.host_id, s.active, h.name as host_name
           from public.staff s left join public.hosts h on h.id = s.host_id
          where s.id = $1`,
        [verified.sub]
      );

      if (!staff) throw forbidden("This account is not set up for the visitor system yet. Ask the Admin to add it.");
      if (!staff.active) throw forbidden("This account is waiting for the Admin to switch it on.");
      if (staff.role === "host" && staff.host_id === null)
        throw forbidden("This Host login is not linked to a host yet. Ask the Admin to link it.");

      req.user = {
        id: staff.id,
        email: staff.email,
        fullName: staff.full_name,
        role: staff.role,
        hostId: staff.host_id,
        hostName: staff.host_name
      };
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Route guard: the signed-in role must be allowed this action. */
export const allow = (action: Action) => (req: Request, _res: Response, next: NextFunction) =>
  can(currentUser(req).role, action) ? next() : next(forbidden());

/** Route guard: any one of these is enough. */
export const allowAny = (...actions: Action[]) => (req: Request, _res: Response, next: NextFunction) =>
  actions.some((a) => can(currentUser(req).role, a)) ? next() : next(forbidden());
