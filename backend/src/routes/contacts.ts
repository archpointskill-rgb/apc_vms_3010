import { Router } from "express";
import { z } from "zod";
import { allow, currentUser } from "../auth/middleware";
import { asActor, type Db } from "../db";
import { Contact } from "../domain/Contact";
import { badRequest, conflict, notFound } from "../lib/errors";
import {
  contactVisits, findDuplicates, getContact, insertContact, presentContact, searchContacts, updateContact
} from "../repositories/contacts";

const contactBody = z.object({
  fullName: z.string().min(1).max(160),
  mobile: z.string().min(4).max(25),
  email: z.string().max(200).nullish(),
  dateOfBirth: z.string().max(10).nullish(),
  address: z.string().max(400).nullish(),
  organisation: z.string().max(200).nullish(),
  designation: z.string().max(120).nullish(),
  notes: z.string().max(2000).nullish(),
  isPrContact: z.boolean().optional(),
  confirmNew: z.boolean().optional()
});

export function contactRoutes(db: Db) {
  const r = Router();
  r.use(allow("contact.read"));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await searchContacts(db, String(req.query.q ?? ""), Number(req.query.limit ?? 50));
      res.json(rows.map((row) => presentContact(row, currentUser(req).role)));
    } catch (e) { next(e); }
  });

  r.get("/:id", async (req, res, next) => {
    try {
      const row = await getContact(db, Number(req.params.id));
      if (!row) throw notFound("That contact no longer exists.");
      res.json({ ...presentContact(row, currentUser(req).role), visits: await contactVisits(db, row.id) });
    } catch (e) { next(e); }
  });

  /**
   * Creating a contact warns about anyone who looks like the same person and
   * stops, unless reception confirms it really is somebody new. Nothing is ever
   * merged on its own.
   */
  r.post("/", allow("contact.create"), async (req, res, next) => {
    try {
      const body = contactBody.parse(req.body ?? {});
      const clean = Contact.clean(body);
      if (!body.confirmNew) {
        const duplicates = await findDuplicates(db, clean);
        if (duplicates.length) {
          throw conflict("Somebody with these details is already in the list.", { duplicates });
        }
      }
      const user = currentUser(req);
      const id = await asActor(db, user.id, (c) => insertContact(c, clean, user.id));
      const row = await getContact(db, id);
      res.status(201).json(presentContact(row!, user.role));
    } catch (e) { next(e); }
  });

  r.patch("/:id", allow("contact.edit"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await getContact(db, id);
      if (!existing) throw notFound("That contact no longer exists.");

      const body = contactBody.partial().parse(req.body ?? {});
      const merged = Contact.clean({
        fullName: body.fullName ?? existing.fullName,
        mobile: body.mobile ?? existing.mobile,
        email: body.email !== undefined ? body.email : existing.email,
        dateOfBirth: body.dateOfBirth !== undefined ? body.dateOfBirth : (existing.dateOfBirth ? String(existing.dateOfBirth).slice(0, 10) : null),
        address: body.address !== undefined ? body.address : existing.address,
        organisation: body.organisation !== undefined ? body.organisation : existing.organisation,
        designation: body.designation !== undefined ? body.designation : existing.designation,
        notes: body.notes !== undefined ? body.notes : existing.notes
      });

      const wantsPr = body.isPrContact ?? existing.isPrContact;
      if (wantsPr && (!merged.email || !merged.dateOfBirth))
        throw badRequest("A PR contact needs both an email address and a date of birth.");

      const user = currentUser(req);
      await asActor(db, user.id, (c) => updateContact(c, id, merged, body.isPrContact));
      const row = await getContact(db, id);
      res.json(presentContact(row!, user.role));
    } catch (e) { next(e); }
  });

  /** Used by the check-in form to warn before a new contact is created. */
  r.post("/check-duplicates", async (req, res, next) => {
    try {
      const body = contactBody.pick({ fullName: true, mobile: true, email: true }).parse(req.body ?? {});
      res.json(await findDuplicates(db, Contact.clean(body)));
    } catch (e) { next(e); }
  });

  return r;
}
