import type { Conn } from "../db";
import { one, query } from "../db";
import type { GiftPatch, GiftState } from "../domain/Gift";
import type {
  Channel, GiftDirection, GiftStatus, GiftTier, InteractionKind,
  PrCategory, PrPriority, PrSource, PrStatus, TaskStatus
} from "../domain/types";

// ---------------------------------------------------------------- profiles
const PROFILE_SELECT = `
  select p.contact_id as "contactId", p.categories::text[] as categories, p.owner_id as "ownerId", o.full_name as "ownerName",
         p.introduction, p.priority, p.gift_tier as "giftTier", p.source,
         p.introduced_by as "introducedById", ib.full_name as "introducedByName",
         p.industry, p.interests, p.organisation_note as "organisationNote",
         p.preferred_channel as "preferredChannel", p.preferred_language as "preferredLanguage",
         p.best_time as "bestTime", p.tags, p.status,
         p.reference_staff_id as "referenceStaffId", rs.full_name as "referenceStaffName",
         p.created_at as "createdAt", p.updated_at as "updatedAt",
         c.contact_code as "contactCode", c.full_name as "fullName", c.mobile, c.email,
         c.organisation, c.designation,
         (select max(i.happened_at) from public.pr_interactions i where i.contact_id = p.contact_id) as "lastInteraction",
         (select min(t.due_on) from public.pr_tasks t
           where t.contact_id = p.contact_id and t.status in ('Open','In progress')) as "nextAction",
         (select count(*)::int from public.pr_tasks t
           where t.contact_id = p.contact_id and t.status in ('Open','In progress') and t.due_on < current_date) as "overdueTasks"
    from public.pr_profiles p
    join public.contacts c on c.id = p.contact_id
    left join public.staff o  on o.id = p.owner_id
    left join public.staff rs on rs.id = p.reference_staff_id
    left join public.contacts ib on ib.id = p.introduced_by`;

export interface ProfileRow {
  contactId: number; categories: PrCategory[]; ownerId: string | null; ownerName: string | null;
  introduction: string | null; priority: PrPriority; giftTier: GiftTier; source: PrSource | null;
  introducedById: number | null; introducedByName: string | null;
  industry: string | null; interests: string | null; organisationNote: string | null;
  preferredChannel: Channel | null; preferredLanguage: string | null; bestTime: string | null;
  tags: string[]; status: PrStatus; referenceStaffId: string | null; referenceStaffName: string | null;
  createdAt: Date; updatedAt: Date;
  contactCode: string; fullName: string; mobile: string; email: string | null;
  organisation: string | null; designation: string | null;
  lastInteraction: Date | null; nextAction: string | null; overdueTasks: number;
}

export interface DirectoryFilters {
  q?: string; category?: PrCategory; ownerId?: string; priority?: PrPriority;
  status?: PrStatus; source?: PrSource; tag?: string; limit?: number;
}

export function listProfiles(c: Conn, f: DirectoryFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.split("?").join(`$${params.length}`)); };

  if (f.q?.trim())
    add("(c.full_name ilike ? or c.mobile like ? or c.email ilike ? or c.contact_code ilike ? or c.organisation ilike ?)",
        `%${f.q.trim()}%`);
  if (f.category) add("? = any(p.categories)", f.category);
  if (f.ownerId) add("p.owner_id = ?", f.ownerId);
  if (f.priority) add("p.priority = ?", f.priority);
  if (f.status) add("p.status = ?", f.status);
  else where.push("p.status <> 'Archived'");
  if (f.source) add("p.source = ?", f.source);
  if (f.tag) add("? = any(p.tags)", f.tag);

  params.push(Math.min(f.limit ?? 100, 500));
  return query<ProfileRow>(
    c,
    `${PROFILE_SELECT} ${where.length ? "where " + where.join(" and ") : ""}
     order by case p.priority when 'Key relationship' then 0 when 'Important' then 1 else 2 end, c.full_name
     limit $${params.length}`,
    params
  );
}

export const getProfile = (c: Conn, contactId: number) =>
  one<ProfileRow>(c, `${PROFILE_SELECT} where p.contact_id = $1`, [contactId]);

export interface ProfileInput {
  categories: PrCategory[]; ownerId: string | null; introduction: string | null;
  priority: PrPriority; giftTier: GiftTier; source: PrSource | null; introducedBy: number | null;
  industry: string | null; interests: string | null; organisationNote: string | null;
  preferredChannel: Channel | null; preferredLanguage: string | null; bestTime: string | null;
  tags: string[]; status: PrStatus; referenceStaffId: string | null;
}

export const createProfile = (c: Conn, contactId: number, input: ProfileInput, by: string) =>
  query(
    c,
    `insert into public.pr_profiles
       (contact_id, categories, owner_id, introduction, priority, gift_tier, source, introduced_by,
        industry, interests, organisation_note, preferred_channel, preferred_language, best_time,
        tags, status, reference_staff_id, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
    [contactId, input.categories, input.ownerId, input.introduction, input.priority, input.giftTier,
     input.source, input.introducedBy, input.industry, input.interests, input.organisationNote,
     input.preferredChannel, input.preferredLanguage, input.bestTime, input.tags, input.status,
     input.referenceStaffId, by]
  );

export const updateProfile = (c: Conn, contactId: number, input: ProfileInput) =>
  query(
    c,
    `update public.pr_profiles set
       categories = $2, owner_id = $3, introduction = $4, priority = $5, gift_tier = $6,
       source = $7, introduced_by = $8, industry = $9, interests = $10, organisation_note = $11,
       preferred_channel = $12, preferred_language = $13, best_time = $14, tags = $15,
       status = $16, reference_staff_id = $17
     where contact_id = $1`,
    [contactId, input.categories, input.ownerId, input.introduction, input.priority, input.giftTier,
     input.source, input.introducedBy, input.industry, input.interests, input.organisationNote,
     input.preferredChannel, input.preferredLanguage, input.bestTime, input.tags, input.status,
     input.referenceStaffId]
  );

export const closeProfile = (c: Conn, contactId: number) =>
  query(c, "delete from public.pr_profiles where contact_id = $1", [contactId]);

// ---------------------------------------------------------------- notes and key dates
export const listNotes = (c: Conn, contactId: number) =>
  query(
    c,
    `select n.id, n.body, n.restricted, n.created_at as "createdAt", s.full_name as "authorName"
       from public.pr_notes n left join public.staff s on s.id = n.author_id
      where n.contact_id = $1 order by n.created_at desc limit 200`,
    [contactId]
  );

export const addNote = (c: Conn, contactId: number, body: string, restricted: boolean, by: string) =>
  query(c, "insert into public.pr_notes (contact_id, body, restricted, author_id) values ($1,$2,$3,$4)",
    [contactId, body, restricted, by]);

export const listKeyDates = (c: Conn, contactId: number) =>
  query(c, `select id, occasion, on_date as "onDate" from public.pr_key_dates where contact_id = $1 order by on_date`, [contactId]);

export const addKeyDate = (c: Conn, contactId: number, occasion: string, onDate: string, by: string) =>
  query(c, "insert into public.pr_key_dates (contact_id, occasion, on_date, created_by) values ($1,$2,$3,$4)",
    [contactId, occasion, onDate, by]);

export const removeKeyDate = (c: Conn, id: number) =>
  query(c, "delete from public.pr_key_dates where id = $1", [id]);

// ---------------------------------------------------------------- interactions
export const listInteractions = (c: Conn, contactId: number, limit = 100) =>
  query(
    c,
    `select i.id, i.kind, i.happened_at as "happenedAt", i.summary, i.outcome, i.project,
            i.visit_id as "visitId", i.gift_id as "giftId", s.full_name as "staffName"
       from public.pr_interactions i left join public.staff s on s.id = i.staff_id
      where i.contact_id = $1 order by i.happened_at desc limit $2`,
    [contactId, Math.min(limit, 500)]
  );

export const addInteraction = (c: Conn, input: {
  contactId: number; kind: InteractionKind; happenedAt: Date; summary: string;
  outcome: string | null; project: string | null; visitId: number | null; giftId: number | null;
  staffId: string | null; by: string;
}) =>
  one<{ id: number }>(
    c,
    `insert into public.pr_interactions
       (contact_id, kind, happened_at, summary, outcome, project, visit_id, gift_id, staff_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [input.contactId, input.kind, input.happenedAt, input.summary, input.outcome, input.project,
     input.visitId, input.giftId, input.staffId ?? input.by, input.by]
  );

// ---------------------------------------------------------------- tasks
const TASK_SELECT = `
  select t.id, t.contact_id as "contactId", c.full_name as "contactName", c.contact_code as "contactCode",
         t.description, t.due_on as "dueOn", t.status, t.completed_at as "completedAt",
         t.owner_id as "ownerId", s.full_name as "ownerName",
         (t.status in ('Open','In progress') and t.due_on < current_date) as overdue
    from public.pr_tasks t
    join public.contacts c on c.id = t.contact_id
    left join public.staff s on s.id = t.owner_id`;

export const listTasksFor = (c: Conn, contactId: number) =>
  query(c, `${TASK_SELECT} where t.contact_id = $1 order by t.status, t.due_on`, [contactId]);

export function listTasks(c: Conn, f: { ownerId?: string; status?: TaskStatus; overdueOnly?: boolean; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.split("?").join(`$${params.length}`)); };
  if (f.ownerId) add("t.owner_id = ?", f.ownerId);
  if (f.status) add("t.status = ?", f.status);
  else where.push("t.status in ('Open','In progress')");
  if (f.overdueOnly) where.push("t.due_on < current_date");
  params.push(Math.min(f.limit ?? 200, 500));
  return query(c, `${TASK_SELECT} ${where.length ? "where " + where.join(" and ") : ""} order by t.due_on limit $${params.length}`, params);
}

export const getTask = (c: Conn, id: number) => one(c, `${TASK_SELECT} where t.id = $1`, [id]);

export const addTask = (c: Conn, input: { contactId: number; description: string; dueOn: string; ownerId: string; by: string }) =>
  one<{ id: number }>(
    c,
    `insert into public.pr_tasks (contact_id, description, due_on, owner_id, created_by)
     values ($1,$2,$3,$4,$5) returning id`,
    [input.contactId, input.description, input.dueOn, input.ownerId, input.by]
  );

export const setTaskStatus = (c: Conn, id: number, status: TaskStatus) =>
  query(c, "update public.pr_tasks set status = $2 where id = $1", [id, status]);

export const editTask = (c: Conn, id: number, description: string, dueOn: string, ownerId: string) =>
  query(c, "update public.pr_tasks set description = $2, due_on = $3, owner_id = $4 where id = $1",
    [id, description, dueOn, ownerId]);

// ---------------------------------------------------------------- gifts
const GIFT_SELECT = `
  select g.id, g.contact_id as "contactId", c.full_name as "contactName", c.contact_code as "contactCode",
         g.direction, g.occasion, g.item, g.tier, g.planned_on as "plannedOn",
         g.planned_value as "plannedValue", g.zero_value_reason as "zeroValueReason", g.currency,
         g.status, g.approved_by as "approvedById", ab.full_name as "approvedByName",
         g.approved_at as "approvedAt", g.decision_note as "decisionNote",
         g.actual_value as "actualValue", g.completed_on as "completedOn",
         g.supplier, g.tracking, g.delivery_note as "deliveryNote", g.override_reason as "overrideReason",
         g.created_by as "createdById", cb.full_name as "createdByName", g.created_at as "createdAt"
    from public.pr_gifts g
    join public.contacts c on c.id = g.contact_id
    left join public.staff ab on ab.id = g.approved_by
    left join public.staff cb on cb.id = g.created_by`;

export interface GiftRow extends GiftState {
  id: number; contactId: number; contactName: string; contactCode: string;
  occasion: string; item: string; tier: GiftTier; plannedOn: string; plannedValue: number;
  currency: string; approvedByName: string | null; approvedAt: Date | null; decisionNote: string | null;
  actualValue: number | null; completedOn: string | null; createdByName: string | null; createdAt: Date;
}

export const listGiftsFor = (c: Conn, contactId: number) =>
  query<GiftRow>(c, `${GIFT_SELECT} where g.contact_id = $1 order by g.planned_on desc`, [contactId]);

export function listGifts(c: Conn, f: { status?: GiftStatus; direction?: GiftDirection; pendingOnly?: boolean; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.split("?").join(`$${params.length}`)); };
  if (f.pendingOnly) where.push("g.status = 'Pending approval'");
  else if (f.status) add("g.status = ?", f.status);
  if (f.direction) add("g.direction = ?", f.direction);
  params.push(Math.min(f.limit ?? 200, 1000));
  return query<GiftRow>(c, `${GIFT_SELECT} ${where.length ? "where " + where.join(" and ") : ""} order by g.planned_on desc limit $${params.length}`, params);
}

export const getGift = (c: Conn, id: number) => one<GiftRow>(c, `${GIFT_SELECT} where g.id = $1`, [id]);

export const findGiftDuplicates = (c: Conn, contactId: number, occasion: string, on: string, direction: GiftDirection) =>
  query<{ id: number; item: string; planned_on: string; status: GiftStatus }>(
    c, "select * from public.gift_duplicates($1,$2,$3,$4)", [contactId, occasion, on, direction]);

export const addGift = (c: Conn, input: {
  contactId: number; direction: GiftDirection; occasion: string; item: string; tier: GiftTier;
  plannedOn: string; plannedValue: number; zeroValueReason: string | null; currency: string;
  status: GiftStatus; supplier: string | null; deliveryNote: string | null; overrideReason: string | null; by: string;
}) =>
  one<{ id: number }>(
    c,
    `insert into public.pr_gifts
       (contact_id, direction, occasion, item, tier, planned_on, planned_value, zero_value_reason,
        currency, status, supplier, delivery_note, override_reason, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
    [input.contactId, input.direction, input.occasion, input.item, input.tier, input.plannedOn,
     input.plannedValue, input.zeroValueReason, input.currency, input.status, input.supplier,
     input.deliveryNote, input.overrideReason, input.by]
  );

export async function applyGiftPatch(c: Conn, id: number, patch: GiftPatch): Promise<void> {
  const columns: Record<keyof GiftPatch, string> = {
    status: "status", approvedBy: "approved_by", approvedAt: "approved_at",
    decisionNote: "decision_note", actualValue: "actual_value", completedOn: "completed_on"
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns) as [keyof GiftPatch, string][]) {
    if (key in patch) { params.push(patch[key] ?? null); sets.push(`${column} = $${params.length}`); }
  }
  if (!sets.length) return;
  await query(c, `update public.pr_gifts set ${sets.join(", ")} where id = $1`, params);
}

/** Planned and actual are kept apart on purpose, so spending is never counted twice. */
export const giftSpend = (c: Conn, from: string, to: string) =>
  one<{ plannedTotal: number; actualTotal: number; count: number }>(
    c,
    `select coalesce(sum(planned_value), 0)::float as "plannedTotal",
            coalesce(sum(actual_value), 0)::float as "actualTotal",
            count(*)::int as count
       from public.pr_gifts
      where direction = 'Given' and status <> 'Cancelled' and planned_on between $1 and $2`,
    [from, to]
  );

// ---------------------------------------------------------------- consent
export const listConsents = (c: Conn, contactId: number) =>
  query(
    c,
    `select c.id, c.channel, c.opted_in as "optedIn", c.source, c.recorded_at as "recordedAt",
            s.full_name as "recordedByName"
       from public.pr_consents c left join public.staff s on s.id = c.recorded_by
      where c.contact_id = $1 order by c.recorded_at desc`,
    [contactId]
  );

export const currentConsent = (c: Conn, contactId: number) =>
  query<{ channel: Channel; optedIn: boolean; source: string; recordedAt: Date }>(
    c,
    `select channel, opted_in as "optedIn", source, recorded_at as "recordedAt"
       from public.pr_current_consent where contact_id = $1`,
    [contactId]
  );

export const recordConsent = (c: Conn, contactId: number, channel: Channel, optedIn: boolean, source: string, by: string) =>
  query(c, "insert into public.pr_consents (contact_id, channel, opted_in, source, recorded_by) values ($1,$2,$3,$4,$5)",
    [contactId, channel, optedIn, source, by]);

// ---------------------------------------------------------------- attachments
export const listAttachments = (c: Conn, contactId: number) =>
  query(
    c,
    `select a.id, a.storage_path as "storagePath", a.file_name as "fileName", a.content_type as "contentType",
            a.size_bytes as "sizeBytes", a.caption, a.created_at as "createdAt", s.full_name as "uploadedByName"
       from public.pr_attachments a left join public.staff s on s.id = a.uploaded_by
      where a.contact_id = $1 order by a.created_at desc`,
    [contactId]
  );

export const addAttachment = (c: Conn, input: {
  contactId: number; storagePath: string; fileName: string; contentType: string | null;
  sizeBytes: number | null; caption: string | null; by: string;
}) =>
  one<{ id: number }>(
    c,
    `insert into public.pr_attachments (contact_id, storage_path, file_name, content_type, size_bytes, caption, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [input.contactId, input.storagePath, input.fileName, input.contentType, input.sizeBytes, input.caption, input.by]
  );

export const getAttachment = (c: Conn, id: number) =>
  one<{ id: number; storagePath: string; contactId: number }>(
    c, `select id, storage_path as "storagePath", contact_id as "contactId" from public.pr_attachments where id = $1`, [id]);

export const removeAttachment = (c: Conn, id: number) =>
  query(c, "delete from public.pr_attachments where id = $1", [id]);

// ---------------------------------------------------------------- dates and summary
export const upcomingDates = (c: Conn, days: number) =>
  query<{ contact_id: number; contact_code: string; full_name: string; occasion: string; on_day: string; days_away: number }>(
    c, "select * from public.pr_upcoming_dates($1)", [Math.min(Math.max(days, 1), 400)]);

export const prSummary = (c: Conn) =>
  one(
    c,
    `select
       (select count(*)::int from public.pr_profiles where status <> 'Archived')                       as relationships,
       (select count(*)::int from public.pr_profiles where priority = 'Key relationship'
          and status <> 'Archived')                                                                     as "keyRelationships",
       (select count(*)::int from public.pr_profiles where status = 'Do not contact')                   as "doNotContact",
       (select count(*)::int from public.pr_tasks where status in ('Open','In progress'))               as "openTasks",
       (select count(*)::int from public.pr_tasks where status in ('Open','In progress')
          and due_on < current_date)                                                                    as "overdueTasks",
       (select count(*)::int from public.pr_gifts where status = 'Pending approval')                    as "giftsAwaitingApproval",
       (select count(*)::int from public.pr_interactions where happened_at > now() - interval '30 days') as "interactions30Days"`
  );

export const categoryCounts = (c: Conn) =>
  query<{ label: string; n: number }>(
    c,
    `select unnest(categories)::text as label, count(*)::int as n
       from public.pr_profiles where status <> 'Archived' group by 1 order by n desc`
  );
