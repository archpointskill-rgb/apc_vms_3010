/**
 * Puts a day's worth of made-up visitors into the database so every screen has
 * something to show, and takes them out again with --clear.
 * Everything it writes is marked as a sample.
 *
 *   npm run seed:samples
 *   npm run samples:clear
 */
import { config } from "../config";
import { asActor, createPool, one, query } from "../db";
import { suggestRoom } from "../domain/LocationRule";
import type { VisitorType, Purpose, VisitStatus, HostReply } from "../domain/types";
import { listRules } from "../repositories/masters";

const db = createPool(config.databaseUrl);
const clearing = process.argv.includes("--clear");

const admin = await one<{ id: string }>(db, "select id from public.staff where role = 'admin' and active order by created_at limit 1");
if (!admin) {
  console.error("No Admin account yet. Create the first user in Supabase > Authentication > Users, then run this again.");
  process.exit(1);
}

if (clearing) {
  await asActor(db, admin.id, async (c) => {
    await query(c, "delete from public.notifications where visit_id in (select id from public.visits where is_sample)");
    await query(c, "delete from public.visits where is_sample");
    await query(c, "delete from public.appointments where is_sample");
    await query(c, "delete from public.contacts where is_sample and id not in (select contact_id from public.visits)");
  });
  console.log("Sample visitors removed. Anything real was left alone.");
  await db.end();
  process.exit(0);
}

const already = await one<{ n: number }>(db, "select count(*)::int as n from public.contacts where is_sample");
if ((already?.n ?? 0) > 0) {
  console.log("Sample visitors are already loaded. Run `npm run samples:clear` first to start again.");
  await db.end();
  process.exit(0);
}

const hosts = await query<{ id: number; name: string; default_room_id: number | null }>(
  db, "select id, name, default_room_id from public.hosts"
);
const hostByName = (name: string) => hosts.find((h) => h.name === name)!;
const rules = await listRules(db);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/** name, mobile, organisation, host, visitor type, purpose, status, minutes ago, host reply */
const people: Array<[string, string, string | null, string | null, VisitorType, Purpose, VisitStatus, number, HostReply | null]> = [
  ["Anita Sharma",     "+919000000101", "Sharma Constructions", "Amit Khandelwal",    "Client",                 "Project discussion", "In meeting",  52,  "Send in"],
  ["Rohit Mehra",      "+919000000102", "Mehra Tiles",          "Amit Khandelwal",    "Vendor and site vendor", "Vendor quote",       "Waiting",     14,  null],
  ["Sneha Rathore",    "+919000000103", null,                   "Vartika Maheshwari", "Interview candidate",    "Interview",          "Waiting",     26,  "Wait 10 minutes"],
  ["Dr. Meera Kapoor", "+919000000104", null,                   "Poonam Ma'am",       "Wellness session",       "Wellness session",   "In meeting",  38,  "Send in"],
  ["Vikas Soni",       "+919000000105", "Soni Hardware",        null,                 "Vendor and site vendor", "Delivery",           "Waiting",      7,  null],
  ["Kunal Jain",       "+919000000106", "Jain Interiors",       "Vasudha Goyal",      "Vendor and site vendor", "Vendor quote",       "Checked out", 250, null],
  ["Pooja Agarwal",    "+919000000107", "Agarwal Realty",       "Neha Sharma",        "Client",                 "Project discussion", "Checked out", 190, null],
  ["Imran Khan",       "+919000000108", "Khan Electricals",     "Yogendra Choudhary", "Vendor and site vendor", "Site matter",        "Denied",      130, "Can't meet today"],
  ["Harish Bansal",    "+919000000110", "Bansal Developers",    "Neha Sharma",        "Client",                 "Project discussion", "In meeting",  236, null],
  ["Riya Gupta",       "+919000000112", null,                   "Vartika Maheshwari", "Interview candidate",    "Interview",          "Checked out", 320, null]
];

await asActor(db, admin.id, async (c) => {
  for (const [name, mobile, org, hostName, type, purpose, status, ago, reply] of people) {
    const contact = await one<{ id: number }>(
      c,
      `insert into public.contacts (full_name, mobile, organisation, created_by, updated_by, is_sample)
       values ($1, $2, $3, $4, $4, true) returning id`,
      [name, mobile, org, admin.id]
    );
    const host = hostName ? hostByName(hostName) : null;
    const roomId = suggestRoom(rules, host?.id ?? null, type, host?.default_room_id ?? null);
    const checkIn = minutesAgo(ago);
    const closed = status === "Checked out" || status === "Denied";
    const checkOut = closed ? minutesAgo(status === "Denied" ? ago - 10 : ago - 45) : null;

    await query(
      c,
      `insert into public.visits
         (contact_id, host_id, visitor_type, purpose, room_id, status, check_in, check_out, reason, reply, replied_at, wait_until, notice_version, created_by, is_sample)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'v1',$13,true)`,
      [contact!.id, host?.id ?? null, type, purpose, roomId, status, checkIn, checkOut,
       status === "Denied" ? "The host could not meet today" : null,
       reply, reply ? checkIn : null,
       reply === "Wait 10 minutes" ? new Date(Date.now() + 4 * 60_000) : null,
       admin.id]
    );
  }

  // Two Board room bookings that overlap, so the meeting-day warning has something to show.
  const amit = hostByName("Amit Khandelwal");
  const board = await one<{ id: number }>(c, "select id from public.rooms where name = 'Board room'");
  const inDays = (d: number, hhmm: string) => {
    const day = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    return new Date(`${day}T${hhmm}:00+05:30`);
  };
  const bookings: Array<[string, string, number, string, "Pending approval" | "Approved"]> = [
    ["Mahesh Tailor",  "+919000000201", 2, "11:00", "Pending approval"],
    ["Sunita Kothari", "+919000000202", 2, "11:30", "Approved"],
    ["Ravi Purohit",   "+919000000203", 5, "10:00", "Approved"]
  ];
  for (const [guestName, guestMobile, days, time, status] of bookings) {
    await query(
      c,
      `insert into public.appointments
         (guest_name, guest_mobile, host_id, visitor_type, purpose, room_id, starts_at, duration_minutes, status, created_by, is_sample)
       values ($1,$2,$3,'Client','Project discussion',$4,$5,60,$6,$7,true)`,
      [guestName, guestMobile, amit.id, board!.id, inDays(days, time), status, admin.id]
    );
  }
});

console.log("Loaded 10 sample visitors and 3 bookings, all marked as samples.");
console.log("Remove them later with: npm run samples:clear");
await db.end();
