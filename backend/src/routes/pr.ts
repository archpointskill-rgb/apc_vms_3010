import { Router } from "express";
import { z } from "zod";
import { allow, allowAny, currentUser } from "../auth/middleware";
import { asActor, type Db } from "../db";
import { Gift } from "../domain/Gift";
import { can } from "../domain/Permissions";
import { PrProfile, PrTask } from "../domain/Pr";
import {
  CHANNELS, GIFT_DIRECTIONS, GIFT_TIERS, INTERACTION_KINDS, PR_CATEGORIES,
  PR_PRIORITIES, PR_SOURCES, PR_STATUSES, TASK_STATUSES
} from "../domain/types";
import { toCsvFile } from "../lib/csv";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import * as pr from "../repositories/pr";
import { getContact } from "../repositories/contacts";

const profileBody = z.object({
  categories: z.array(z.enum(PR_CATEGORIES)).optional(),
  ownerId: z.string().uuid().nullish(),
  introduction: z.string().max(4000).nullish(),
  priority: z.enum(PR_PRIORITIES).optional(),
  giftTier: z.enum(GIFT_TIERS).optional(),
  source: z.enum(PR_SOURCES).nullish(),
  introducedBy: z.number().int().positive().nullish(),
  industry: z.string().max(200).nullish(),
  interests: z.string().max(1000).nullish(),
  organisationNote: z.string().max(1000).nullish(),
  preferredChannel: z.enum(CHANNELS).nullish(),
  preferredLanguage: z.string().max(60).nullish(),
  bestTime: z.string().max(120).nullish(),
  tags: z.array(z.string().max(40)).optional(),
  status: z.enum(PR_STATUSES).optional(),
  referenceStaffId: z.string().uuid().nullish()
});

export function prRoutes(db: Db) {
  const r = Router();
  r.use(allow("pr.read"));

  // ---------------------------------------------------------------- directory
  r.get("/", async (req, res, next) => {
    try {
      res.json(await pr.listProfiles(db, {
        q: req.query.q as string | undefined,
        category: req.query.category as never,
        ownerId: req.query.ownerId as string | undefined,
        priority: req.query.priority as never,
        status: req.query.status as never,
        source: req.query.source as never,
        tag: req.query.tag as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      }));
    } catch (e) { next(e); }
  });

  r.get("/summary", async (_req, res, next) => {
    try {
      const [summary, categories] = await Promise.all([pr.prSummary(db), pr.categoryCounts(db)]);
      res.json({ ...summary, categories });
    } catch (e) { next(e); }
  });

  r.get("/upcoming", async (req, res, next) => {
    try { res.json(await pr.upcomingDates(db, Number(req.query.days ?? 30))); } catch (e) { next(e); }
  });

  r.get("/tasks", async (req, res, next) => {
    try {
      res.json(await pr.listTasks(db, {
        ownerId: req.query.mine === "1" ? currentUser(req).id : (req.query.ownerId as string | undefined),
        status: req.query.status as never,
        overdueOnly: req.query.overdue === "1"
      }));
    } catch (e) { next(e); }
  });

  r.get("/gifts", async (req, res, next) => {
    try {
      res.json(await pr.listGifts(db, {
        pendingOnly: req.query.pending === "1",
        status: req.query.status as never,
        direction: req.query.direction as never
      }));
    } catch (e) { next(e); }
  });

  /** Planned and actual are reported side by side, never added together. */
  r.get("/gifts/spend", allow("pr.export"), async (req, res, next) => {
    try {
      const from = String(req.query.from ?? `${new Date().getFullYear()}-01-01`);
      const to = String(req.query.to ?? `${new Date().getFullYear()}-12-31`);
      res.json({ from, to, ...(await pr.giftSpend(db, from, to)) });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- one relationship
  r.get("/:contactId", async (req, res, next) => {
    try {
      const contactId = Number(req.params.contactId);
      const profile = await pr.getProfile(db, contactId);
      if (!profile) throw notFound("There is no relationship record for this person yet.");
      const viewer = currentUser(req);
      const [notes, keyDates, interactions, tasks, gifts, consent, attachments] = await Promise.all([
        pr.listNotes(db, contactId), pr.listKeyDates(db, contactId), pr.listInteractions(db, contactId),
        pr.listTasksFor(db, contactId), pr.listGiftsFor(db, contactId),
        pr.currentConsent(db, contactId), pr.listAttachments(db, contactId)
      ]);
      res.json({
        ...profile,
        // the restricted notes are for the Manager and the Admin
        notes: can(viewer.role, "pr.notesRestricted") ? notes : notes.filter((n: any) => !n.restricted),
        keyDates, interactions, tasks, gifts, attachments,
        consent: consent.map((c) => ({
          ...c, mayContact: PrProfile.mayContact(profile.status, c.optedIn)
        }))
      });
    } catch (e) { next(e); }
  });

  /**
   * Opening a relationship record on somebody who already exists.
   * It never makes a second person: the contact keeps the code it already has,
   * and the database insists it has an email address and a date of birth first.
   */
  r.post("/:contactId", allow("pr.manage"), async (req, res, next) => {
    try {
      const contactId = Number(req.params.contactId);
      const contact = await getContact(db, contactId);
      if (!contact) throw notFound("That contact does not exist.");
      if (await pr.getProfile(db, contactId)) throw conflict("This person already has a relationship record.");
      if (!contact.email || !contact.dateOfBirth)
        throw badRequest("A relationship record needs the person's email address and date of birth. Add them to the contact first.");

      const body = profileBody.parse(req.body ?? {});
      const viewer = currentUser(req);
      await asActor(db, viewer.id, (c) => pr.createProfile(c, contactId, shape(body, viewer.id), viewer.id));
      res.status(201).json(await pr.getProfile(db, contactId));
    } catch (e) { next(e); }
  });

  r.patch("/:contactId", allow("pr.manage"), async (req, res, next) => {
    try {
      const contactId = Number(req.params.contactId);
      const existing = await pr.getProfile(db, contactId);
      if (!existing) throw notFound("There is no relationship record for this person yet.");
      const body = profileBody.parse(req.body ?? {});
      const viewer = currentUser(req);
      const merged = {
        categories: body.categories ? PrProfile.tidyCategories(body.categories) : existing.categories,
        ownerId: body.ownerId !== undefined ? body.ownerId ?? null : existing.ownerId,
        introduction: body.introduction !== undefined ? body.introduction ?? null : existing.introduction,
        priority: body.priority ?? existing.priority,
        giftTier: body.giftTier ?? existing.giftTier,
        source: body.source !== undefined ? body.source ?? null : existing.source,
        introducedBy: body.introducedBy !== undefined ? body.introducedBy ?? null : existing.introducedById,
        industry: body.industry !== undefined ? body.industry ?? null : existing.industry,
        interests: body.interests !== undefined ? body.interests ?? null : existing.interests,
        organisationNote: body.organisationNote !== undefined ? body.organisationNote ?? null : existing.organisationNote,
        preferredChannel: body.preferredChannel !== undefined ? body.preferredChannel ?? null : existing.preferredChannel,
        preferredLanguage: body.preferredLanguage !== undefined ? body.preferredLanguage ?? null : existing.preferredLanguage,
        bestTime: body.bestTime !== undefined ? body.bestTime ?? null : existing.bestTime,
        tags: body.tags ? PrProfile.tidyTags(body.tags) : existing.tags,
        status: body.status ?? existing.status,
        referenceStaffId: body.referenceStaffId !== undefined ? body.referenceStaffId ?? null : existing.referenceStaffId
      };
      await asActor(db, viewer.id, (c) => pr.updateProfile(c, contactId, merged));
      res.json(await pr.getProfile(db, contactId));
    } catch (e) { next(e); }
  });

  /** Closing a relationship leaves the person and their visits exactly as they were. */
  r.delete("/:contactId", allowAny("pr.notesRestricted"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      await asActor(db, viewer.id, (c) => pr.closeProfile(c, Number(req.params.contactId)));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- notes
  r.post("/:contactId/notes", allow("pr.manage"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const body = z.object({ body: z.string().min(1).max(4000), restricted: z.boolean().optional() }).parse(req.body ?? {});
      if (body.restricted && !can(viewer.role, "pr.notesRestricted"))
        throw forbidden("Only a manager or the Admin can write a restricted note.");
      await asActor(db, viewer.id, (c) => pr.addNote(c, Number(req.params.contactId), body.body.trim(), body.restricted ?? false, viewer.id));
      res.status(201).json(await pr.listNotes(db, Number(req.params.contactId)));
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- key dates
  r.post("/:contactId/key-dates", allow("pr.manage"), async (req, res, next) => {
    try {
      const body = z.object({
        occasion: z.string().min(1).max(120),
        onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      }).parse(req.body ?? {});
      const viewer = currentUser(req);
      await asActor(db, viewer.id, (c) => pr.addKeyDate(c, Number(req.params.contactId), body.occasion.trim(), body.onDate, viewer.id));
      res.status(201).json(await pr.listKeyDates(db, Number(req.params.contactId)));
    } catch (e) { next(e); }
  });

  r.delete("/:contactId/key-dates/:id", allow("pr.manage"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      await asActor(db, viewer.id, (c) => pr.removeKeyDate(c, Number(req.params.id)));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- interactions
  r.post("/:contactId/interactions", allow("pr.manage"), async (req, res, next) => {
    try {
      const body = z.object({
        kind: z.enum(INTERACTION_KINDS),
        happenedAt: z.string().optional(),
        summary: z.string().min(1).max(4000),
        outcome: z.string().max(2000).nullish(),
        project: z.string().max(200).nullish(),
        visitId: z.number().int().positive().nullish(),
        staffId: z.string().uuid().nullish(),
        nextAction: z.object({
          description: z.string().min(1).max(500),
          dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          ownerId: z.string().uuid().optional()
        }).nullish()
      }).parse(req.body ?? {});

      const happenedAt = body.happenedAt ? new Date(body.happenedAt) : new Date();
      if (Number.isNaN(happenedAt.getTime())) throw badRequest("That date and time are not valid.");
      if (happenedAt.getTime() > Date.now() + 86_400_000)
        throw badRequest("An interaction is something that already happened. Use a follow-up task for something planned.");

      const contactId = Number(req.params.contactId);
      const viewer = currentUser(req);
      await asActor(db, viewer.id, async (c) => {
        await pr.addInteraction(c, {
          contactId, kind: body.kind, happenedAt, summary: body.summary.trim(),
          outcome: body.outcome ?? null, project: body.project ?? null,
          visitId: body.visitId ?? null, giftId: null, staffId: body.staffId ?? null, by: viewer.id
        });
        // "what happens next" is recorded as a real task, so it cannot be forgotten
        if (body.nextAction) {
          await pr.addTask(c, {
            contactId, description: body.nextAction.description.trim(),
            dueOn: PrTask.validateDue(body.nextAction.dueOn),
            ownerId: body.nextAction.ownerId ?? viewer.id, by: viewer.id
          });
        }
      });
      res.status(201).json(await pr.listInteractions(db, contactId));
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- tasks
  r.post("/:contactId/tasks", allow("pr.manage"), async (req, res, next) => {
    try {
      const body = z.object({
        description: z.string().min(1).max(500),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ownerId: z.string().uuid().optional()
      }).parse(req.body ?? {});
      const viewer = currentUser(req);
      const contactId = Number(req.params.contactId);
      await asActor(db, viewer.id, (c) => pr.addTask(c, {
        contactId, description: body.description.trim(), dueOn: PrTask.validateDue(body.dueOn),
        ownerId: body.ownerId ?? viewer.id, by: viewer.id
      }));
      res.status(201).json(await pr.listTasksFor(db, contactId));
    } catch (e) { next(e); }
  });

  r.patch("/tasks/:id", allow("pr.manage"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const task = await pr.getTask(db, id);
      if (!task) throw notFound("That follow-up no longer exists.");
      const body = z.object({
        status: z.enum(TASK_STATUSES).optional(),
        description: z.string().min(1).max(500).optional(),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        ownerId: z.string().uuid().optional()
      }).parse(req.body ?? {});
      const viewer = currentUser(req);
      await asActor(db, viewer.id, async (c) => {
        if (body.description || body.dueOn || body.ownerId) {
          await pr.editTask(c, id, body.description ?? (task as any).description,
            body.dueOn ?? String((task as any).dueOn), body.ownerId ?? (task as any).ownerId);
        }
        if (body.status) await pr.setTaskStatus(c, id, body.status);
      });
      res.json(await pr.getTask(db, id));
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- gifts
  r.post("/:contactId/gifts", allow("gift.propose"), async (req, res, next) => {
    try {
      const body = z.object({
        direction: z.enum(GIFT_DIRECTIONS),
        occasion: z.string().min(1).max(120),
        item: z.string().min(1).max(300),
        tier: z.enum(GIFT_TIERS).optional(),
        plannedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        plannedValue: z.number().min(0),
        zeroValueReason: z.string().max(300).nullish(),
        currency: z.string().length(3).optional(),
        supplier: z.string().max(200).nullish(),
        deliveryNote: z.string().max(1000).nullish(),
        overrideReason: z.string().max(300).nullish()
      }).parse(req.body ?? {});

      const contactId = Number(req.params.contactId);
      const profile = await pr.getProfile(db, contactId);
      if (!profile) throw notFound("Open a relationship record for this person first.");
      if (body.plannedValue === 0 && !body.zeroValueReason?.trim())
        throw badRequest("A gift with no value needs a short reason.");
      if (profile.giftTier === "No gifts" && !body.overrideReason?.trim())
        throw badRequest("This person is marked as receiving no gifts. Say why you are overriding that.");

      // Same person, same occasion, same year, same direction: probably already recorded.
      const duplicates = await pr.findGiftDuplicates(db, contactId, body.occasion, body.plannedOn, body.direction);
      if (duplicates.length && !body.overrideReason?.trim())
        throw conflict("A gift for this person and occasion is already recorded this year.", { duplicates });

      const viewer = currentUser(req);
      const created = await asActor(db, viewer.id, (c) => pr.addGift(c, {
        contactId, direction: body.direction, occasion: body.occasion.trim(), item: body.item.trim(),
        tier: body.tier ?? profile.giftTier, plannedOn: body.plannedOn, plannedValue: body.plannedValue,
        zeroValueReason: body.zeroValueReason?.trim() || null, currency: body.currency ?? "INR",
        status: Gift.statusWhenProposed(body.direction), supplier: body.supplier ?? null,
        deliveryNote: body.deliveryNote ?? null, overrideReason: body.overrideReason?.trim() || null, by: viewer.id
      }));
      res.status(201).json(await pr.getGift(db, created!.id));
    } catch (e) { next(e); }
  });

  /** Every decision on a gift goes through here, so the rules cannot be skipped. */
  const decide = (name: string, decider: (gift: pr.GiftRow, viewer: string, body: any) => ReturnType<typeof Gift.approve>, needs: "decide" | "manage") =>
    async (req: any, res: any, next: any) => {
      try {
        const viewer = currentUser(req);
        if (needs === "decide" && !can(viewer.role, "gift.decide"))
          throw forbidden(`Only a manager or the Admin can ${name} a gift.`);
        const gift = await pr.getGift(db, Number(req.params.id));
        if (!gift) throw notFound("That gift record no longer exists.");
        const patch = decider(gift, viewer.id, req.body ?? {});
        await asActor(db, viewer.id, (c) => pr.applyGiftPatch(c, gift.id, patch));
        res.json(await pr.getGift(db, gift.id));
      } catch (e) { next(e); }
    };

  r.post("/gifts/:id/approve", decide("approve", (g, who, b) => Gift.approve(g, who, b.note), "decide"));
  r.post("/gifts/:id/decline", decide("decline", (g, who, b) => Gift.decline(g, who, String(b.reason ?? "")), "decide"));
  r.post("/gifts/:id/acknowledge", decide("acknowledge", (g, who, b) =>
    Gift.acknowledge(g, who, Number(b.actualValue), String(b.completedOn ?? "")), "decide"));
  r.post("/gifts/:id/dispatch", decide("dispatch", (g) => Gift.dispatch(g), "manage"));
  r.post("/gifts/:id/complete", decide("complete", (g, _who, b) =>
    Gift.complete(g, Number(b.actualValue), String(b.completedOn ?? "")), "manage"));
  r.post("/gifts/:id/cancel", decide("cancel", (g, _who, b) => Gift.cancel(g, String(b.reason ?? "")), "manage"));
  r.post("/gifts/:id/return", decide("return", (g, _who, b) => Gift.markReturned(g, String(b.reason ?? "")), "manage"));

  // ---------------------------------------------------------------- consent
  r.post("/:contactId/consent", allow("pr.manage"), async (req, res, next) => {
    try {
      const body = z.object({
        channel: z.enum(CHANNELS),
        optedIn: z.boolean(),
        source: z.string().min(1).max(200)
      }).parse(req.body ?? {});
      const viewer = currentUser(req);
      const contactId = Number(req.params.contactId);
      await asActor(db, viewer.id, (c) => pr.recordConsent(c, contactId, body.channel, body.optedIn, body.source.trim(), viewer.id));
      res.status(201).json(await pr.listConsents(db, contactId));
    } catch (e) { next(e); }
  });

  r.get("/:contactId/consent", async (req, res, next) => {
    try { res.json(await pr.listConsents(db, Number(req.params.contactId))); } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- attachments
  r.post("/:contactId/attachments", allow("pr.manage"), async (req, res, next) => {
    try {
      const contactId = Number(req.params.contactId);
      const body = z.object({
        storagePath: z.string().min(1).max(400),
        fileName: z.string().min(1).max(200),
        contentType: z.string().max(100).nullish(),
        sizeBytes: z.number().int().min(1).max(10485760).nullish(),
        caption: z.string().max(300).nullish()
      }).parse(req.body ?? {});

      // The file has to sit in this contact's own folder, so one record cannot
      // claim another's file.
      if (!body.storagePath.startsWith(`pr/${contactId}/`))
        throw badRequest("That file does not belong to this contact.");

      const viewer = currentUser(req);
      await asActor(db, viewer.id, (c) => pr.addAttachment(c, {
        contactId, storagePath: body.storagePath, fileName: body.fileName,
        contentType: body.contentType ?? null, sizeBytes: body.sizeBytes ?? null,
        caption: body.caption ?? null, by: viewer.id
      }));
      res.status(201).json(await pr.listAttachments(db, contactId));
    } catch (e) { next(e); }
  });

  r.delete("/attachments/:id", allowAny("pr.notesRestricted"), async (req, res, next) => {
    try {
      const viewer = currentUser(req);
      const file = await pr.getAttachment(db, Number(req.params.id));
      if (!file) throw notFound("That file is already gone.");
      await asActor(db, viewer.id, (c) => pr.removeAttachment(c, file.id));
      res.json({ ok: true, storagePath: file.storagePath });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- export
  /**
   * The PR directory as a spreadsheet. Anybody marked "Do not contact" is left
   * out of a list meant for sending things, and the file says so.
   */
  r.get("/export/directory.csv", allow("pr.export"), async (req, res, next) => {
    try {
      const forSending = req.query.purpose === "promotional";
      const rows = await pr.listProfiles(db, { limit: 500 });
      const usable = forSending ? rows.filter((p) => p.status === "Active") : rows;

      const header = ["Contact code", "Name", "Organisation", "Mobile", "Email", "Categories",
        "Priority", "Relationship owner", "Status", "Gift tier", "Source", "Last interaction", "Next action", "Overdue"];
      const body = usable.map((p) => [
        p.contactCode, p.fullName, p.organisation ?? "", p.mobile, p.email ?? "",
        p.categories.join("; "), p.priority, p.ownerName ?? "", p.status, p.giftTier, p.source ?? "",
        p.lastInteraction ? new Date(p.lastInteraction).toISOString().slice(0, 10) : "",
        p.nextAction ?? "", p.overdueTasks || ""
      ]);

      const viewer = currentUser(req);
      await asActor(db, viewer.id, (c) => c.query(
        `insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, detail)
         values ($1,$2,'export','pr_profiles',null,$3::jsonb)`,
        [viewer.id, viewer.fullName, JSON.stringify({ rows: body.length, purpose: forSending ? "promotional" : "internal" })]
      ));

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="archpoint-pr-directory-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(toCsvFile([header, ...body]));
    } catch (e) { next(e); }
  });

  return r;
}

function shape(body: z.infer<typeof profileBody>, fallbackOwner: string) {
  return {
    categories: PrProfile.tidyCategories(body.categories),
    ownerId: body.ownerId ?? fallbackOwner,          // the one who opened it, until reassigned
    introduction: body.introduction ?? null,
    priority: body.priority ?? "Standard",
    giftTier: body.giftTier ?? "Standard",
    source: body.source ?? null,
    introducedBy: body.introducedBy ?? null,
    industry: body.industry ?? null,
    interests: body.interests ?? null,
    organisationNote: body.organisationNote ?? null,
    preferredChannel: body.preferredChannel ?? null,
    preferredLanguage: body.preferredLanguage ?? null,
    bestTime: body.bestTime ?? null,
    tags: PrProfile.tidyTags(body.tags),
    status: body.status ?? "Active",
    referenceStaffId: body.referenceStaffId ?? null
  } as const;
}
