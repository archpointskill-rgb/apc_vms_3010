import { Router } from "express";
import { allow, currentUser } from "../auth/middleware";
import { asActor, type Db, query } from "../db";
import { can } from "../domain/Permissions";
import { formatDate, formatTime, officeDayStart, startOfOfficeDay, addDays } from "../lib/dates";
import { toCsvFile } from "../lib/csv";
import { forbidden } from "../lib/errors";
import { auditTrail, onPremises, summary } from "../repositories/reports";
import { listVisits } from "../repositories/visits";
import { Visit } from "../domain/Visit";

export function reportRoutes(db: Db) {
  const r = Router();

  r.get("/reports/summary", allow("report.view"), async (_req, res, next) => {
    try { res.json(await summary(db, startOfOfficeDay())); } catch (e) { next(e); }
  });

  r.get("/reports/on-premises", async (_req, res, next) => {
    try { res.json(await onPremises(db)); } catch (e) { next(e); }
  });

  r.get("/audit", allow("audit.view"), async (req, res, next) => {
    try { res.json(await auditTrail(db, Number(req.query.limit ?? 200))); } catch (e) { next(e); }
  });

  /**
   * The visitor register as a spreadsheet.
   * Reception gets today only and no email or date of birth; a host gets their
   * own visitors; a manager or the Admin gets everything.
   */
  r.get("/export/visits.csv", async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const everything = can(viewer.role, "export.everything");
      const ownOnly = !everything && can(viewer.role, "export.ownOnly");
      const todayOnly = !everything && !ownOnly && can(viewer.role, "export.todayOnly");
      if (!everything && !ownOnly && !todayOnly) throw forbidden("Your role cannot export the register.");

      const from = req.query.from ? officeDayStart(String(req.query.from)) : todayOnly ? startOfOfficeDay() : undefined;
      const to = req.query.to ? addDays(officeDayStart(String(req.query.to)), 1) : undefined;

      const rows = await listVisits(db, viewer, {
        from, to,
        hostId: req.query.hostId ? Number(req.query.hostId) : undefined,
        limit: 5000
      });

      const header = [
        "Contact code", "Name", "Mobile",
        ...(everything ? ["Email", "Organisation"] : []),
        "Host", "Visitor type", "Purpose", "Room", "Floor", "Status",
        "Check-in date", "Check-in time", "Check-out time", "Minutes", "Reason", "Flagged for review"
      ];
      const body = rows.map((v) => [
        v.contactCode, v.contactName, v.contactMobile,
        ...(everything ? [v.contactEmail ?? "", v.contactOrg ?? ""] : []),
        v.hostName ?? "Unassigned", v.visitorType, v.purpose, v.roomName ?? "", v.roomFloor ?? "", v.status,
        formatDate(v.checkIn), formatTime(v.checkIn), v.checkOut ? formatTime(v.checkOut) : "",
        Visit.durationMinutes(v) ?? "", v.reason ?? "", Visit.needsReview(v) ? "Yes" : ""
      ]);

      await asActor(db, viewer.id, (c) =>
        query(c, `insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, detail)
                  values ($1, $2, 'export', 'visits', null, $3::jsonb)`,
          [viewer.id, viewer.fullName, JSON.stringify({ rows: body.length, role: viewer.role })])
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="archpoint-visitors-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(toCsvFile([header, ...body]));
    } catch (e) { next(e); }
  });

  return r;
}
