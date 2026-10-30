import type { Conn } from "../db";
import { one, query } from "../db";

export async function summary(c: Conn, dayStart: Date) {
  const now = await one<{
    insideNow: number; waitingNow: number; visitsToday: number; avgStayMinutes: number | null; flagged: number;
  }>(
    c,
    `select
       (select count(*)::int from public.visits where status in ('Waiting','In meeting'))           as "insideNow",
       (select count(*)::int from public.visits where status = 'Waiting')                           as "waitingNow",
       (select count(*)::int from public.visits where check_in >= $1)                               as "visitsToday",
       (select round(avg(extract(epoch from (check_out - check_in)) / 60))::int
          from public.visits where status = 'Checked out' and check_in >= $1)                       as "avgStayMinutes",
       (select count(*)::int from public.visits
         where status in ('Waiting','In meeting') and check_in < now() - interval '3 hours')        as flagged`,
    [dayStart]
  );

  const [byType, byDay, byHour, byHost, repeatVisitors] = await Promise.all([
    query(c, `select visitor_type as label, count(*)::int as n from public.visits group by 1 order by n desc`),
    query(c, `select to_char(check_in at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as label, count(*)::int as n
                from public.visits where check_in >= now() - interval '30 days' group by 1 order by 1`),
    query(c, `select to_char(check_in at time zone 'Asia/Kolkata', 'HH24') as label, count(*)::int as n
                from public.visits group by 1 order by 1`),
    query(c, `select coalesce(h.name, 'Unassigned') as label, count(*)::int as n
                from public.visits v left join public.hosts h on h.id = v.host_id group by 1 order by n desc limit 12`),
    query(c, `select c.contact_code as code, c.full_name as name, count(*)::int as visits,
                     max(v.check_in) as "lastVisit"
                from public.visits v join public.contacts c on c.id = v.contact_id
               group by c.id having count(*) > 1 order by visits desc, name limit 15`)
  ]);

  return { ...now!, byType, byDay, byHour, byHost, repeatVisitors };
}

export const onPremises = (c: Conn) =>
  query(
    c,
    `select v.id, c.full_name as name, c.contact_code as code, c.mobile,
            coalesce(h.name, 'Unassigned') as host, r.name as room, r.floor,
            v.status, v.check_in as "checkIn"
       from public.visits v
       join public.contacts c on c.id = v.contact_id
       left join public.hosts h on h.id = v.host_id
       left join public.rooms r on r.id = v.room_id
      where v.status in ('Waiting','In meeting') order by v.check_in`
  );

export const auditTrail = (c: Conn, limit = 200) =>
  query(
    c,
    `select id, at, actor_name as "actorName", action, entity, entity_id as "entityId", detail
       from public.audit_log order by id desc limit $1`,
    [Math.min(limit, 1000)]
  );
