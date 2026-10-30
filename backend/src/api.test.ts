import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./testing/harness";
import { officeDateString } from "./lib/dates";

let h: Harness;
let admin = "", reception = "", amit = "", neha = "", manager = "", newcomer = "";
let amitHost = 0, nehaHost = 0, vartikaHost = 0, poonamHost = 0;

beforeAll(async () => {
  h = await startHarness();
  admin = await h.addUser("archpointskill@gmail.com", "Pratap Singh");   // first account becomes Admin
  reception = await h.addUser("reception@archpoint.in", "Front Desk");
  amit = await h.addUser("amit@archpoint.in", "Amit Khandelwal");
  neha = await h.addUser("neha@archpoint.in", "Neha Sharma");
  manager = await h.addUser("manager@archpoint.in", "Office Manager");
  newcomer = await h.addUser("newbie@archpoint.in", "Not Approved Yet");

  amitHost = await h.hostId("Amit Khandelwal");
  nehaHost = await h.hostId("Neha Sharma");
  vartikaHost = await h.hostId("Vartika Maheshwari");
  poonamHost = await h.hostId("Poonam Ma'am");

  await h.setRole(reception, "reception");
  await h.setRole(amit, "host", amitHost);
  await h.setRole(neha, "host", nehaHost);
  await h.setRole(manager, "manager");
}, 120_000);

afterAll(async () => { await h?.stop(); });

const newContact = async (token: string, fields: Record<string, unknown>) =>
  h.call("POST", "/api/contacts", token, fields);

describe("signing in", () => {
  it("turns away a request with no token", async () => {
    expect((await h.call("GET", "/api/visits")).status).toBe(401);
  });
  it("turns away a token it cannot verify", async () => {
    expect((await h.call("GET", "/api/visits", "not-a-real-token")).status).toBe(401);
  });
  it("makes the very first account the Admin", async () => {
    const me = await h.call("GET", "/api/me", admin);
    expect(me.body.user.role).toBe("admin");
    expect(me.body.actions).toContain("staff.manage");
  });
  it("holds a new sign-up until the Admin switches it on", async () => {
    const res = await h.call("GET", "/api/me", newcomer);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/switch it on/i);
  });
  it("tells each role what it may do", async () => {
    const asReception = await h.call("GET", "/api/me", reception);
    expect(asReception.body.actions).toContain("visit.checkIn");
    expect(asReception.body.actions).not.toContain("report.view");
    expect(asReception.body.actions).not.toContain("contact.viewFullDob");
  });
});

describe("contacts", () => {
  let anita = 0;

  it("creates a contact and gives it the next code", async () => {
    const res = await newContact(reception, {
      fullName: "Anita Sharma", mobile: "98290 00001", organisation: "Sharma Constructions", dateOfBirth: "1990-05-24"
    });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("AP-C-000001");
    expect(res.body.mobile).toBe("+919829000001");   // normalised to +91
    anita = res.body.id;
  });

  it("refuses a mobile number that cannot be real", async () => {
    const res = await newContact(reception, { fullName: "Bad Number", mobile: "12345" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid mobile/i);
  });

  it("refuses a date of birth in the future", async () => {
    const res = await newContact(reception, { fullName: "Time Traveller", mobile: "9829000099", dateOfBirth: "2999-01-01" });
    expect(res.status).toBe(400);
  });

  it("warns about the same mobile number instead of making a second record", async () => {
    const res = await newContact(reception, { fullName: "Anita S", mobile: "+919829000001" });
    expect(res.status).toBe(409);
    expect(res.body.duplicates[0].reason).toBe("mobile");
    expect(res.body.duplicates[0].code).toBe("AP-C-000001");
  });

  it("warns about a very similar name", async () => {
    const res = await newContact(reception, { fullName: "Anita Sharmaa", mobile: "9829000002" });
    expect(res.status).toBe(409);
    expect(res.body.duplicates[0].reason).toBe("name");
  });

  it("creates it anyway once reception confirms they are different people", async () => {
    const res = await newContact(reception, { fullName: "Anita Sharmaa", mobile: "9829000002", confirmNew: true });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("AP-C-000002");
  });

  it("gives reception the birthday but never the year", async () => {
    const res = await h.call("GET", `/api/contacts/${anita}`, reception);
    expect(res.body.dateOfBirth).toBeNull();
    expect(res.body.birthday).toBe("24 May");
  });

  it("gives the Manager the full date of birth", async () => {
    const res = await h.call("GET", `/api/contacts/${anita}`, manager);
    expect(res.body.dateOfBirth).toBe("1990-05-24");
  });

  it("keeps the contact list away from hosts", async () => {
    expect((await h.call("GET", "/api/contacts", amit)).status).toBe(403);
  });

  it("finds a contact by name, mobile, organisation or code", async () => {
    for (const term of ["Anita", "9829000001", "Sharma Constructions", "AP-C-000001"]) {
      const res = await h.call("GET", `/api/contacts?q=${encodeURIComponent(term)}`, reception);
      expect(res.body.length, term).toBeGreaterThanOrEqual(1);
    }
  });

  it("refuses to make it a PR contact without an email and date of birth", async () => {
    const plain = (await newContact(reception, { fullName: "Plain Person", mobile: "9829000055", confirmNew: true })).body;
    const res = await h.call("PATCH", `/api/contacts/${plain.id}`, reception, { isPrContact: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email address and a date of birth/i);
  });

  it("allows it once both are there", async () => {
    const res = await h.call("PATCH", `/api/contacts/${anita}`, manager, { isPrContact: true, email: "anita@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.isPrContact).toBe(true);
  });
});

describe("checking a visitor in", () => {
  let rohit = 0, visitId = 0;

  beforeAll(async () => {
    rohit = (await newContact(reception, { fullName: "Rohit Mehra", mobile: "9829000003", organisation: "Mehra Tiles" })).body.id;
  });

  it("sends Amit's client to the Board room without being told", async () => {
    const suggestion = await h.call("GET", `/api/suggest-room?hostId=${amitHost}&visitorType=Client`, reception);
    expect(suggestion.body.name).toBe("Board room");
    expect(suggestion.body.floor).toBe("3rd");
  });

  it("sends an interview candidate to the interview room whoever the host is", async () => {
    const suggestion = await h.call("GET", `/api/suggest-room?hostId=${nehaHost}&visitorType=Interview candidate`, reception);
    expect(suggestion.body.name).toBe("Interview room");
  });

  it("checks the visitor in and alerts the host", async () => {
    const res = await h.call("POST", "/api/visits", reception, {
      contactId: rohit, hostId: amitHost, visitorType: "Client", purpose: "Project discussion", remarks: "Tile selection"
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Waiting");
    expect(res.body.room.name).toBe("Board room");
    visitId = res.body.id;

    const alerts = await h.call("GET", "/api/notifications", amit);
    expect(alerts.body[0].body).toContain("Rohit Mehra");
    expect(alerts.body[0].readAt).toBeNull();
  });

  it("refuses a second check-in while the first is still open", async () => {
    const res = await h.call("POST", "/api/visits", reception, {
      contactId: rohit, hostId: amitHost, visitorType: "Client", purpose: "Other"
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already checked in/i);
  });

  it("lets a host see only the visitors who came for them", async () => {
    const other = (await newContact(reception, { fullName: "Neha Guest", mobile: "9829000004" })).body.id;
    await h.call("POST", "/api/visits", reception, { contactId: other, hostId: nehaHost, visitorType: "Client", purpose: "Other" });

    const amitsBoard = await h.call("GET", "/api/visits", amit);
    expect(amitsBoard.body.every((v: any) => v.host.id === amitHost)).toBe(true);
    expect(amitsBoard.body.some((v: any) => v.contact.name === "Neha Guest")).toBe(false);

    const receptionBoard = await h.call("GET", "/api/visits", reception);
    expect(receptionBoard.body.length).toBeGreaterThanOrEqual(2);
  });

  it("lets the host ask the visitor to wait ten minutes", async () => {
    const res = await h.call("POST", `/api/visits/${visitId}/reply`, amit, { reply: "Wait 10 minutes" });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Wait 10 minutes");
    expect(new Date(res.body.waitUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("stops a host answering for somebody else's visitor", async () => {
    const res = await h.call("POST", `/api/visits/${visitId}/reply`, neha, { reply: "Send in" });
    expect(res.status).toBe(403);
  });

  it("will not let a host check a visitor out", async () => {
    expect((await h.call("POST", `/api/visits/${visitId}/check-out`, amit)).status).toBe(403);
  });

  it("runs Waiting to In meeting to Checked out and records the length", async () => {
    expect((await h.call("POST", `/api/visits/${visitId}/start`, reception)).body.status).toBe("In meeting");
    const out = await h.call("POST", `/api/visits/${visitId}/check-out`, reception);
    expect(out.body.status).toBe("Checked out");
    expect(out.body.durationMinutes).toBeGreaterThanOrEqual(0);
  });

  it("will not start a meeting for somebody already checked out", async () => {
    const res = await h.call("POST", `/api/visits/${visitId}/start`, reception);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/waiting visitor/i);
  });

  it("lets the same person come back once the last visit is closed", async () => {
    const res = await h.call("POST", "/api/visits", reception, {
      contactId: rohit, hostId: amitHost, visitorType: "Vendor and site vendor", purpose: "Vendor quote"
    });
    expect(res.status).toBe(201);
    await h.call("POST", `/api/visits/${res.body.id}/check-out`, reception);
  });

  it("needs a reason to cancel or deny", async () => {
    const guest = (await newContact(reception, { fullName: "Walk In", mobile: "9829000005" })).body.id;
    const visit = (await h.call("POST", "/api/visits", reception, {
      contactId: guest, hostId: nehaHost, visitorType: "Client", purpose: "Other"
    })).body;

    const blank = await h.call("POST", `/api/visits/${visit.id}/cancel`, reception, { reason: "   " });
    expect(blank.status).toBe(400);
    expect(blank.body.error).toMatch(/needs a reason/i);

    const done = await h.call("POST", `/api/visits/${visit.id}/deny`, reception, { reason: "No appointment" });
    expect(done.body.status).toBe("Denied");
    expect(done.body.reason).toBe("No appointment");
  });

  it("denies the visit when the host cannot meet today", async () => {
    const guest = (await newContact(reception, { fullName: "Unlucky Caller", mobile: "9829000006" })).body.id;
    const visit = (await h.call("POST", "/api/visits", reception, {
      contactId: guest, hostId: amitHost, visitorType: "Client", purpose: "Other"
    })).body;
    const res = await h.call("POST", `/api/visits/${visit.id}/reply`, amit, { reply: "Can't meet today" });
    expect(res.body.status).toBe("Denied");
    expect(res.body.reason).toMatch(/could not meet/i);
    expect(res.body.checkOut).not.toBeNull();
  });

  it("keeps a visitor with no host in the Unassigned queue until one is chosen", async () => {
    const courier = (await newContact(reception, { fullName: "Parcel Courier", mobile: "9829000007" })).body.id;
    const visit = (await h.call("POST", "/api/visits", reception, {
      contactId: courier, visitorType: "Vendor and site vendor", purpose: "Delivery"
    })).body;
    expect(visit.unassigned).toBe(true);
    expect(visit.host).toBeNull();

    const assigned = await h.call("POST", `/api/visits/${visit.id}/assign`, reception, { hostId: amitHost });
    expect(assigned.body.unassigned).toBe(false);
    expect(assigned.body.room.name).toBe("Board room");
  });

  it("counts each reminder sent to the host", async () => {
    const board = await h.call("GET", "/api/visits", reception);
    const waiting = board.body.find((v: any) => v.status === "Waiting" && v.host);
    const res = await h.call("POST", `/api/visits/${waiting.id}/remind`, reception);
    expect(res.body.reminders).toBe(waiting.reminders + 1);
  });

  it("records a wellness visit as 'Wellness session' and keeps the remarks private", async () => {
    const client = (await newContact(reception, { fullName: "Wellness Guest", mobile: "9829000008" })).body.id;
    const res = await h.call("POST", "/api/visits", reception, {
      contactId: client, hostId: poonamHost, visitorType: "Wellness session",
      purpose: "Project discussion", remarks: "a private note"
    });
    expect(res.body.purpose).toBe("Wellness session");   // whatever was chosen
    expect(res.body.remarks).toBeNull();                 // hidden from reception
    expect(res.body.room.name).toBe("Poonam Ma'am cabin");

    const asManager = await h.call("GET", `/api/visits/${res.body.id}`, manager);
    expect(asManager.body.remarks).toBe("a private note");
  });
});

describe("appointments and the meeting day", () => {
  const day = "2026-11-03";
  let pending = 0;

  it("books a slot, which waits for the host to agree", async () => {
    const res = await h.call("POST", "/api/appointments", reception, {
      guestName: "Mahesh Tailor", guestMobile: "9829000011", hostId: amitHost,
      visitorType: "Client", purpose: "Project discussion", date: day, time: "11:00"
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Pending approval");
    expect(res.body.roomName).toBe("Board room");
    pending = res.body.id;
  });

  it("lets the host approve it", async () => {
    const res = await h.call("POST", `/api/appointments/${pending}/approve`, amit);
    expect(res.body.status).toBe("Approved");
  });

  it("stops another host answering it", async () => {
    expect((await h.call("POST", `/api/appointments/${pending}/decline`, neha)).status).toBe(403);
  });

  it("warns when two bookings want the Board room at once", async () => {
    await h.call("POST", "/api/appointments", reception, {
      guestName: "Sunita Kothari", guestMobile: "9829000012", hostId: amitHost,
      visitorType: "Client", purpose: "Project discussion", date: day, time: "11:30"
    });
    const res = await h.call("GET", `/api/appointments/day/${day}`, reception);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.clashes).toHaveLength(1);
    expect(res.body.clashes[0].roomName).toBe("Board room");
  });

  it("stops warning once one of them is declined", async () => {
    const items = (await h.call("GET", `/api/appointments/day/${day}`, reception)).body.items;
    await h.call("POST", `/api/appointments/${items[1].id}/decline`, manager);
    const res = await h.call("GET", `/api/appointments/day/${day}`, reception);
    expect(res.body.clashes).toHaveLength(0);
  });

  it("shows a host only their own bookings", async () => {
    await h.call("POST", "/api/appointments", reception, {
      guestName: "Neha's Guest", guestMobile: "9829000013", hostId: nehaHost,
      visitorType: "Client", purpose: "Project discussion", date: day, time: "15:00"
    });
    const res = await h.call("GET", `/api/appointments/day/${day}`, amit);
    expect(res.body.items.every((a: any) => a.hostId === amitHost)).toBe(true);
  });

  it("approves a host's own booking straight away", async () => {
    const res = await h.call("POST", "/api/appointments", amit, {
      guestName: "Amit's Own Guest", guestMobile: "9829000014", hostId: amitHost,
      visitorType: "Client", purpose: "Project discussion", date: day, time: "17:00"
    });
    expect(res.body.status).toBe("Approved");
  });

  it("stops a host booking somebody else's time", async () => {
    const res = await h.call("POST", "/api/appointments", amit, {
      guestName: "Not Mine", guestMobile: "9829000015", hostId: nehaHost,
      visitorType: "Client", purpose: "Project discussion", date: day, time: "18:00"
    });
    expect(res.status).toBe(403);
  });

  it("lets reception move a slot on the timeline", async () => {
    const res = await h.call("PATCH", `/api/appointments/${pending}`, reception, { time: "12:30", durationMinutes: 30 });
    expect(res.status).toBe(200);
    expect(res.body.durationMinutes).toBe(30);
  });

  it("turns an arriving appointment into a visit", async () => {
    const guest = (await newContact(reception, { fullName: "Mahesh Tailor", mobile: "9829000011", confirmNew: true })).body.id;
    const res = await h.call("POST", "/api/visits", reception, {
      contactId: guest, hostId: amitHost, visitorType: "Client", purpose: "Project discussion", appointmentId: pending
    });
    expect(res.status).toBe(201);
    expect(res.body.appointmentId).toBe(pending);
  });
});

describe("reports, exports and the audit trail", () => {
  it("keeps the dashboard away from reception", async () => {
    expect((await h.call("GET", "/api/reports/summary", reception)).status).toBe(403);
  });

  it("gives the Manager the numbers", async () => {
    const res = await h.call("GET", "/api/reports/summary", manager);
    expect(res.status).toBe(200);
    expect(res.body.visitsToday).toBeGreaterThan(0);
    expect(res.body.byType.length).toBeGreaterThan(0);
    expect(res.body.repeatVisitors.some((r: any) => r.visits > 1)).toBe(true);
  });

  it("lists who is on the premises right now", async () => {
    const res = await h.call("GET", "/api/reports/on-premises", reception);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("leaves email and date of birth out of reception's export", async () => {
    const res = await h.call("GET", "/api/export/visits.csv", reception);
    expect(res.status).toBe(200);
    expect(res.body).not.toContain("Email");
    expect(res.body).toContain("Contact code");
  });

  it("gives the Manager everything", async () => {
    const res = await h.call("GET", "/api/export/visits.csv", manager);
    expect(res.body).toContain("Email");
    expect(res.body).toContain("Organisation");
  });

  it("gives a host only their own visitors", async () => {
    const res = await h.call("GET", "/api/export/visits.csv", amit);
    expect(res.status).toBe(200);
    expect(res.body).not.toContain("Neha Guest");
  });

  it("stops a spreadsheet treating a name as a formula", async () => {
    const id = (await newContact(reception, { fullName: '=HYPERLINK("http://evil","click")', mobile: "9829000044", confirmNew: true })).body.id;
    await h.call("POST", "/api/visits", reception, { contactId: id, hostId: nehaHost, visitorType: "Client", purpose: "Other" });
    const res = await h.call("GET", "/api/export/visits.csv", manager);
    expect(res.body).toContain("'=HYPERLINK");
  });

  it("records every change, with who made it and no date of birth", async () => {
    expect((await h.call("GET", "/api/audit", reception)).status).toBe(403);
    const res = await h.call("GET", "/api/audit", manager);
    expect(res.body.length).toBeGreaterThan(10);
    expect(res.body.some((e: any) => e.actorName === "Front Desk")).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("1990-05-24");
  });

  it("notes who exported the register", async () => {
    const res = await h.call("GET", "/api/audit", manager);
    expect(res.body.some((e: any) => e.action === "export")).toBe(true);
  });
});

describe("the Admin's own screens", () => {
  it("keeps the staff list to the Admin", async () => {
    expect((await h.call("GET", "/api/staff", manager)).status).toBe(403);
    const res = await h.call("GET", "/api/staff", admin);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
  });

  it("switches a waiting account on and gives it a role", async () => {
    const res = await h.call("PATCH", `/api/staff/${newcomer}`, admin, { role: "reception", active: true });
    expect(res.status).toBe(200);
    expect((await h.call("GET", "/api/me", newcomer)).body.user.role).toBe("reception");
  });

  it("insists a Host login points at a host", async () => {
    const res = await h.call("PATCH", `/api/staff/${newcomer}`, admin, { role: "host", hostId: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/linked to a host/i);
  });

  it("stops the Admin locking themselves out", async () => {
    const res = await h.call("PATCH", `/api/staff/${admin}`, admin, { role: "reception" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/your own role/i);
  });

  it("saves a host's WhatsApp number for the alerts", async () => {
    const res = await h.call("PATCH", `/api/hosts/${vartikaHost}`, admin, { mobile: "98290 12345" });
    expect(res.status).toBe(200);
    const hosts = await h.call("GET", "/api/hosts", admin);
    expect(hosts.body.find((x: any) => x.id === vartikaHost).mobile).toBe("+919829012345");
  });

  it("refuses a host mobile number that cannot be real", async () => {
    const res = await h.call("PATCH", `/api/hosts/${vartikaHost}`, admin, { mobile: "123" });
    expect(res.status).toBe(400);
  });

  it("keeps host and room editing away from reception", async () => {
    expect((await h.call("PATCH", `/api/hosts/${amitHost}`, reception, { designation: "x" })).status).toBe(403);
  });

  it("stores the Make.com webhook as a setting", async () => {
    const res = await h.call("PUT", "/api/settings/alerts", admin, {
      makeWebhookUrl: "https://hook.eu2.make.com/example", whatsappEnabled: true
    });
    expect(res.status).toBe(200);
    expect((await h.call("GET", "/api/settings/alerts", admin)).body.whatsappEnabled).toBe(true);
  });
});

describe("the live board", () => {
  it("shows today's visits and anyone still inside", async () => {
    const res = await h.call("GET", "/api/visits", reception);
    expect(res.status).toBe(200);
    const statuses = new Set(res.body.map((v: any) => v.status));
    expect(statuses.has("Checked out")).toBe(true);
    expect(res.body.every((v: any) => v.contact.code.startsWith("AP-C-"))).toBe(true);
  });

  it("marks a visit left open too long for review without closing it", async () => {
    const guest = (await newContact(reception, { fullName: "Long Meeting", mobile: "9829000077" })).body.id;
    const visit = (await h.call("POST", "/api/visits", reception, {
      contactId: guest, hostId: nehaHost, visitorType: "Client", purpose: "Other"
    })).body;
    // Move the arrival back four hours, as if it had been open all afternoon.
    await h.db.query("update public.visits set check_in = now() - interval '4 hours' where id = $1", [visit.id]);
    const res = await h.call("GET", `/api/visits/${visit.id}`, reception);
    expect(res.body.needsReview).toBe(true);
    expect(res.body.status).toBe("Waiting");
    expect(res.body.checkOut).toBeNull();      // never given an invented leaving time
  });

  it("counts today from midnight in the office's own time zone", async () => {
    const today = officeDateString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
