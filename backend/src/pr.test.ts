import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./testing/harness";

let h: Harness;
let reception = "", manager = "", amit = "";
let kiran = 0, plain = 0;

/** Someone a relationship can be opened on: a full contact record. */
const fullContact = async (name: string, mobile: string, email: string, dob: string) =>
  (await h.call("POST", "/api/contacts", reception, { fullName: name, mobile, email, dateOfBirth: dob, confirmNew: true })).body.id as number;

beforeAll(async () => {
  h = await startHarness(54343);
  await h.addUser("archpointskill@gmail.com", "Pratap Singh");   // the first account is the Admin
  reception = await h.addUser("reception@archpoint.in", "Front Desk");
  manager = await h.addUser("manager@archpoint.in", "Office Manager");
  amit = await h.addUser("amit@archpoint.in", "Amit Khandelwal");
  await h.setRole(reception, "reception");
  await h.setRole(manager, "manager");
  await h.setRole(amit, "host", await h.hostId("Amit Khandelwal"));

  kiran = await fullContact("Kiran Malhotra", "9829000301", "kiran@example.com", "1984-02-29");
  plain = (await h.call("POST", "/api/contacts", reception, { fullName: "Just A Visitor", mobile: "9829000302" })).body.id;
}, 120_000);

afterAll(async () => { await h?.stop(); });

describe("opening a relationship record", () => {
  it("refuses somebody with no email or date of birth, and says what is missing", async () => {
    const res = await h.call("POST", `/api/pr/${plain}`, reception, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email address and date of birth/i);
  });

  it("reuses the person who is already there instead of making a second one", async () => {
    const before = (await h.call("GET", `/api/contacts/${kiran}`, reception)).body;
    const res = await h.call("POST", `/api/pr/${kiran}`, reception, {
      categories: ["Client", "Partner"], priority: "Key relationship", giftTier: "Premium", source: "Visit"
    });
    expect(res.status).toBe(201);
    expect(res.body.contactCode).toBe(before.code);          // same code as the visitor had
    expect(res.body.categories).toEqual(["Client", "Partner"]);

    const after = (await h.call("GET", `/api/contacts/${kiran}`, reception)).body;
    expect(after.isPrContact).toBe(true);
    expect(after.id).toBe(before.id);
  });

  it("will not open a second record for the same person", async () => {
    const res = await h.call("POST", `/api/pr/${kiran}`, reception, {});
    expect(res.status).toBe(409);
  });

  it("gives the person who opened it as the relationship owner until it is reassigned", async () => {
    const res = await h.call("GET", `/api/pr/${kiran}`, reception);
    expect(res.body.ownerName).toBe("Front Desk");
  });

  it("falls back to Other when no category is chosen", async () => {
    const someone = await fullContact("Unclassified Person", "9829000303", "u@example.com", "1990-01-01");
    const res = await h.call("POST", `/api/pr/${someone}`, reception, {});
    expect(res.body.categories).toEqual(["Other"]);
  });

  it("keeps hosts out of the relationship records altogether", async () => {
    expect((await h.call("GET", "/api/pr", amit)).status).toBe(403);
    expect((await h.call("GET", `/api/pr/${kiran}`, amit)).status).toBe(403);
  });

  it("holds several categories on one person without copying them", async () => {
    const res = await h.call("PATCH", `/api/pr/${kiran}`, reception, { categories: ["Client", "Vendor", "Media"] });
    expect(res.body.categories).toHaveLength(3);
    expect((await h.call("GET", "/api/contacts?q=Kiran", reception)).body).toHaveLength(1);
  });
});

describe("the directory", () => {
  it("finds people by category, priority and free text", async () => {
    expect((await h.call("GET", "/api/pr?category=Media", reception)).body.length).toBeGreaterThanOrEqual(1);
    expect((await h.call("GET", "/api/pr?priority=Key relationship", reception)).body.length).toBeGreaterThanOrEqual(1);
    const byText = await h.call("GET", "/api/pr?q=Kiran", reception);
    expect(byText.body[0].fullName).toBe("Kiran Malhotra");
    expect((await h.call("GET", "/api/pr?q=nobody-by-this-name", reception)).body).toHaveLength(0);
  });

  it("leaves archived relationships out unless they are asked for", async () => {
    const gone = await fullContact("Archived Person", "9829000304", "a@example.com", "1990-01-01");
    await h.call("POST", `/api/pr/${gone}`, reception, {});
    await h.call("PATCH", `/api/pr/${gone}`, manager, { status: "Archived" });
    const names = (await h.call("GET", "/api/pr", reception)).body.map((p: any) => p.fullName);
    expect(names).not.toContain("Archived Person");
    expect((await h.call("GET", "/api/pr?status=Archived", reception)).body.length).toBe(1);
  });
});

describe("notes", () => {
  it("keeps a restricted note away from reception", async () => {
    await h.call("POST", `/api/pr/${kiran}/notes`, reception, { body: "Met at the Dholera event." });
    await h.call("POST", `/api/pr/${kiran}/notes`, manager, { body: "Fee discussion, management only.", restricted: true });

    const asReception = await h.call("GET", `/api/pr/${kiran}`, reception);
    expect(asReception.body.notes).toHaveLength(1);
    expect(JSON.stringify(asReception.body.notes)).not.toContain("Fee discussion");

    const asManager = await h.call("GET", `/api/pr/${kiran}`, manager);
    expect(asManager.body.notes).toHaveLength(2);
  });

  it("stops reception marking a note restricted", async () => {
    const res = await h.call("POST", `/api/pr/${kiran}/notes`, reception, { body: "Secret", restricted: true });
    expect(res.status).toBe(403);
  });
});

describe("the interaction timeline", () => {
  it("records what happened, with who dealt with them", async () => {
    const res = await h.call("POST", `/api/pr/${kiran}/interactions`, reception, {
      kind: "Meeting", summary: "Reviewed the Jaipur site drawings.", outcome: "Wants a revised fee proposal."
    });
    expect(res.status).toBe(201);
    expect(res.body[0].summary).toContain("Jaipur site drawings");
    expect(res.body[0].staffName).toBe("Front Desk");
  });

  it("refuses something dated in the future, because that is a follow-up", async () => {
    const soon = new Date(Date.now() + 7 * 86400000).toISOString();
    const res = await h.call("POST", `/api/pr/${kiran}/interactions`, reception, {
      kind: "Call", summary: "Not yet happened", happenedAt: soon
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already happened/i);
  });

  it("turns 'what happens next' into a real follow-up task", async () => {
    const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await h.call("POST", `/api/pr/${kiran}/interactions`, reception, {
      kind: "Call", summary: "Discussed the proposal.",
      nextAction: { description: "Send the revised fee proposal", dueOn: due }
    });
    const profile = await h.call("GET", `/api/pr/${kiran}`, reception);
    expect(profile.body.tasks.some((t: any) => t.description === "Send the revised fee proposal")).toBe(true);
    expect(profile.body.nextAction).toBeTruthy();
  });
});

describe("follow-up tasks", () => {
  let overdue = 0;

  it("marks an overdue task as overdue", async () => {
    const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const res = await h.call("POST", `/api/pr/${kiran}/tasks`, reception, { description: "Chase the signed copy", dueOn: past });
    overdue = res.body.find((t: any) => t.description === "Chase the signed copy").id;
    expect(res.body.find((t: any) => t.id === overdue).overdue).toBe(true);
    expect((await h.call("GET", "/api/pr/tasks?overdue=1", reception)).body.length).toBeGreaterThanOrEqual(1);
  });

  it("stamps the finish time by itself, and clears it when reopened", async () => {
    const done = await h.call("PATCH", `/api/pr/tasks/${overdue}`, reception, { status: "Completed" });
    expect(done.body.completedAt).not.toBeNull();
    expect(done.body.overdue).toBe(false);
    const again = await h.call("PATCH", `/api/pr/tasks/${overdue}`, reception, { status: "Open" });
    expect(again.body.completedAt).toBeNull();
  });

  it("lists only my own follow-ups when asked", async () => {
    const mine = await h.call("GET", "/api/pr/tasks?mine=1", manager);
    expect(mine.body.every((t: any) => t.ownerName === "Office Manager")).toBe(true);
  });
});

describe("gifts", () => {
  let proposed = 0;

  it("sends every outgoing gift for approval rather than straight through", async () => {
    const res = await h.call("POST", `/api/pr/${kiran}/gifts`, reception, {
      direction: "Given", occasion: "Diwali", item: "EKASA gift hamper",
      plannedOn: "2026-11-08", plannedValue: 3500
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Pending approval");
    expect(res.body.tier).toBe("Premium");          // taken from the relationship's tier
    proposed = res.body.id;
  });

  it("will not let the proposer approve their own gift", async () => {
    const res = await h.call("POST", `/api/pr/gifts/${proposed}/approve`, reception);
    expect(res.status).toBe(403);
  });

  it("lets a manager approve it", async () => {
    const res = await h.call("POST", `/api/pr/gifts/${proposed}/approve`, manager, { note: "Fine for a key relationship." });
    expect(res.body.status).toBe("Approved");
    expect(res.body.approvedByName).toBe("Office Manager");
  });

  it("will not mark a gift delivered without what it really cost", async () => {
    const res = await h.call("POST", `/api/pr/gifts/${proposed}/complete`, reception, { completedOn: "2026-11-08" });
    expect(res.status).toBe(400);
  });

  it("records the real cost separately from the planned one", async () => {
    const res = await h.call("POST", `/api/pr/gifts/${proposed}/complete`, reception, {
      actualValue: 3200, completedOn: "2026-11-08"
    });
    expect(res.body.status).toBe("Delivered");
    expect(Number(res.body.plannedValue)).toBe(3500);
    expect(Number(res.body.actualValue)).toBe(3200);
  });

  it("keeps planned and actual apart in the spending figures", async () => {
    const res = await h.call("GET", "/api/pr/gifts/spend?from=2026-01-01&to=2026-12-31", manager);
    expect(res.body.plannedTotal).toBeGreaterThanOrEqual(3500);
    expect(res.body.actualTotal).toBeGreaterThanOrEqual(3200);
    expect(res.body.plannedTotal).not.toBe(res.body.plannedTotal + res.body.actualTotal);
  });

  it("warns about the same person, occasion and year, and takes a reason to go ahead", async () => {
    const again = await h.call("POST", `/api/pr/${kiran}/gifts`, reception, {
      direction: "Given", occasion: "diwali", item: "Sweets box", plannedOn: "2026-11-09", plannedValue: 900
    });
    expect(again.status).toBe(409);
    expect(again.body.duplicates).toHaveLength(1);

    const forced = await h.call("POST", `/api/pr/${kiran}/gifts`, reception, {
      direction: "Given", occasion: "diwali", item: "Sweets box", plannedOn: "2026-11-09",
      plannedValue: 900, overrideReason: "Separate gift for the family"
    });
    expect(forced.status).toBe(201);
  });

  it("asks why when a gift is worth nothing", async () => {
    const res = await h.call("POST", `/api/pr/${kiran}/gifts`, reception, {
      direction: "Given", occasion: "Site visit", item: "Brochure", plannedOn: "2026-12-01", plannedValue: 0
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/short reason/i);

    const ok = await h.call("POST", `/api/pr/${kiran}/gifts`, reception, {
      direction: "Given", occasion: "Site visit", item: "Brochure", plannedOn: "2026-12-01",
      plannedValue: 0, zeroValueReason: "Printed material, no cost"
    });
    expect(ok.status).toBe(201);
  });

  it("stops a gift to somebody marked as receiving none, unless it is explained", async () => {
    const noGifts = await fullContact("No Gifts Please", "9829000305", "n@example.com", "1988-03-03");
    await h.call("POST", `/api/pr/${noGifts}`, reception, { giftTier: "No gifts" });
    const blocked = await h.call("POST", `/api/pr/${noGifts}/gifts`, reception, {
      direction: "Given", occasion: "Diwali", item: "Hamper", plannedOn: "2026-11-08", plannedValue: 2000
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/no gifts/i);
  });

  it("acknowledges an incoming gift rather than approving it", async () => {
    const incoming = await h.call("POST", `/api/pr/${kiran}/gifts`, reception, {
      direction: "Received", occasion: "New year", item: "Desk clock", plannedOn: "2026-01-05", plannedValue: 1200
    });
    expect(incoming.body.status).toBe("Planned");
    expect((await h.call("POST", `/api/pr/gifts/${incoming.body.id}/approve`, manager)).status).toBe(400);
    const done = await h.call("POST", `/api/pr/gifts/${incoming.body.id}/acknowledge`, manager, {
      actualValue: 1200, completedOn: "2026-01-05"
    });
    expect(done.body.status).toBe("Received");
    expect(done.body.approvedByName).toBe("Office Manager");
  });

  it("shows a manager everything still waiting on them", async () => {
    const res = await h.call("GET", "/api/pr/gifts?pending=1", manager);
    expect(res.body.every((g: any) => g.status === "Pending approval")).toBe(true);
  });

  it("keeps the decision away from reception", async () => {
    const fresh = await h.call("POST", `/api/pr/${kiran}/gifts`, reception, {
      direction: "Given", occasion: "Holi", item: "Hamper", plannedOn: "2027-03-03", plannedValue: 1500
    });
    expect((await h.call("POST", `/api/pr/gifts/${fresh.body.id}/approve`, reception)).status).toBe(403);
    expect((await h.call("POST", `/api/pr/gifts/${fresh.body.id}/decline`, reception, { reason: "no" })).status).toBe(403);
  });
});

describe("permission to contact somebody", () => {
  it("treats a visit, a birthday and a relationship record as no permission at all", async () => {
    const res = await h.call("GET", `/api/pr/${kiran}`, reception);
    const whatsapp = res.body.consent.find((c: any) => c.channel === "WhatsApp");
    expect(whatsapp).toBeUndefined();        // nothing recorded means nothing allowed
  });

  it("records permission per channel, with where it came from", async () => {
    await h.call("POST", `/api/pr/${kiran}/consent`, reception, {
      channel: "WhatsApp", optedIn: true, source: "Signed the form at reception"
    });
    const res = await h.call("GET", `/api/pr/${kiran}`, reception);
    const whatsapp = res.body.consent.find((c: any) => c.channel === "WhatsApp");
    expect(whatsapp.mayContact).toBe(true);
    expect(res.body.consent.find((c: any) => c.channel === "Email")).toBeUndefined();
  });

  it("keeps the whole history when somebody opts out", async () => {
    await h.call("POST", `/api/pr/${kiran}/consent`, reception, {
      channel: "WhatsApp", optedIn: false, source: "Asked to stop"
    });
    const now = (await h.call("GET", `/api/pr/${kiran}`, reception)).body.consent.find((c: any) => c.channel === "WhatsApp");
    expect(now.mayContact).toBe(false);
    const history = await h.call("GET", `/api/pr/${kiran}/consent`, reception);
    expect(history.body.filter((c: any) => c.channel === "WhatsApp")).toHaveLength(2);
  });

  it("lets 'Do not contact' overrule a permission given earlier", async () => {
    await h.call("POST", `/api/pr/${kiran}/consent`, reception, { channel: "Email", optedIn: true, source: "Replied by email" });
    await h.call("PATCH", `/api/pr/${kiran}`, manager, { status: "Do not contact" });
    const res = await h.call("GET", `/api/pr/${kiran}`, reception);
    expect(res.body.consent.find((c: any) => c.channel === "Email").mayContact).toBe(false);
  });

  it("leaves 'Do not contact' out of a list meant for sending things", async () => {
    const forSending = await h.call("GET", "/api/pr/export/directory.csv?purpose=promotional", manager);
    expect(forSending.body).not.toContain("Kiran Malhotra");
    const internal = await h.call("GET", "/api/pr/export/directory.csv", manager);
    expect(internal.body).toContain("Kiran Malhotra");
    await h.call("PATCH", `/api/pr/${kiran}`, manager, { status: "Active" });
  });

  it("keeps the directory export away from reception", async () => {
    expect((await h.call("GET", "/api/pr/export/directory.csv", reception)).status).toBe(403);
  });
});

describe("birthdays and key dates", () => {
  it("lists what is coming without ever giving away a birth year", async () => {
    const res = await h.call("GET", "/api/pr/upcoming?days=400", reception);
    const birthday = res.body.find((d: any) => d.full_name === "Kiran Malhotra" && d.occasion === "Birthday");
    expect(birthday).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain("1984");
  });

  it("moves a 29 February birthday to the day the office chose", async () => {
    const res = await h.call("GET", "/api/pr/upcoming?days=400", reception);
    const birthday = res.body.find((d: any) => d.full_name === "Kiran Malhotra" && d.occasion === "Birthday");
    const day = new Date(birthday.on_day);
    const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    if (!isLeap(day.getUTCFullYear())) {
      expect(`${day.getUTCMonth() + 1}-${day.getUTCDate()}`).toBe("2-28");
    }
  });

  it("includes a key date that was added by hand", async () => {
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await h.call("POST", `/api/pr/${kiran}/key-dates`, reception, { occasion: "Office anniversary", onDate: soon });
    const res = await h.call("GET", "/api/pr/upcoming?days=30", reception);
    expect(res.body.some((d: any) => d.occasion === "Office anniversary")).toBe(true);
  });
});

describe("attachments", () => {
  it("records a file against the right contact", async () => {
    const res = await h.call("POST", `/api/pr/${kiran}/attachments`, reception, {
      storagePath: `pr/${kiran}/card.png`, fileName: "card.png", contentType: "image/png", sizeBytes: 48000
    });
    expect(res.status).toBe(201);
    expect(res.body[0].fileName).toBe("card.png");
  });

  it("refuses a file that belongs in somebody else's folder", async () => {
    const res = await h.call("POST", `/api/pr/${kiran}/attachments`, reception, {
      storagePath: "pr/999/someone-elses.png", fileName: "x.png"
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong/i);
  });

  it("lets only a manager or the Admin remove one", async () => {
    const list = (await h.call("GET", `/api/pr/${kiran}`, reception)).body.attachments;
    expect((await h.call("DELETE", `/api/pr/attachments/${list[0].id}`, reception)).status).toBe(403);
    expect((await h.call("DELETE", `/api/pr/attachments/${list[0].id}`, manager)).status).toBe(200);
  });
});

describe("the overview and the audit trail", () => {
  it("counts what the office needs to act on", async () => {
    const res = await h.call("GET", "/api/pr/summary", reception);
    expect(res.body.relationships).toBeGreaterThanOrEqual(3);
    expect(res.body.keyRelationships).toBeGreaterThanOrEqual(1);
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(res.body.openTasks).toBeGreaterThanOrEqual(1);
  });

  it("writes every PR change to the trail, including who exported what", async () => {
    const log = (await h.call("GET", "/api/audit", manager)).body;
    expect(log.some((e: any) => e.entity === "pr_profiles")).toBe(true);
    expect(log.some((e: any) => e.entity === "pr_gifts")).toBe(true);
    expect(log.some((e: any) => e.action === "export" && e.entity === "pr_profiles")).toBe(true);
    expect(JSON.stringify(log)).not.toContain("1984-02-29");
  });

  it("closes a relationship without losing the person or their visits", async () => {
    const temp = await fullContact("Short Lived", "9829000306", "s@example.com", "1991-06-06");
    await h.call("POST", `/api/pr/${temp}`, reception, {});
    expect((await h.call("DELETE", `/api/pr/${temp}`, reception)).status).toBe(403);
    expect((await h.call("DELETE", `/api/pr/${temp}`, manager)).status).toBe(200);

    const contact = await h.call("GET", `/api/contacts/${temp}`, reception);
    expect(contact.status).toBe(200);
    expect(contact.body.isPrContact).toBe(false);
    expect((await h.call("GET", `/api/pr/${temp}`, reception)).status).toBe(404);
  });
});
