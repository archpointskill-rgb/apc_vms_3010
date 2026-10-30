# ArchPoint Visitors

Visitor management and public relations for the Arch Point office, Jaipur, in one
application on one shared contact record. React web app, Node API, Supabase Postgres.

connect@archpointgp.com · @archpoint_architecture · archpoint.in

---

## Your Supabase project

Already created and set up:

| | |
|---|---|
| Project | **archpoint-vms** (`benvidirtbvfwyoohlyd`), Mumbai region |
| API address | `https://benvidirtbvfwyoohlyd.supabase.co` |
| Dashboard | supabase.com → archpoint-vms |

The tables, rules, security and your 8 hosts, 11 rooms and 4 meeting-location rules are already in it.

---

## Getting it running

You need **Node.js 20 or newer** (nodejs.org) and VS Code.

### 1. Install

```bash
npm run setup
```

### 2. Give the backend the database address

Open **Supabase → Project Settings → Database → Connection string → Session pooler**.
Press **Reset database password**, copy the new password, then paste the whole string into
`backend/.env` as `DATABASE_URL`, with the password in place of `[YOUR-PASSWORD]`.

```
DATABASE_URL=postgresql://postgres.benvidirtbvfwyoohlyd:THE-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

`backend/.env` and `frontend/.env` already have the Supabase address and the publishable key filled in.

### 3. Create the first account

**Supabase → Authentication → Users → Add user**: `archpointskill@gmail.com`, a password,
and tick *Auto Confirm User*. The first account to exist becomes the **Admin** automatically.
Everybody added after that arrives switched off, waiting for the Admin to give them a role.

### 4. Start it

```bash
npm run dev
```

The web app is at **http://localhost:5173**, the API at **http://localhost:4000**.

Optional: `npm run seed:samples` fills the screens with ten made-up visitors and three bookings,
all marked as samples. `npm run samples:clear` removes them again.

### Trying it with no Supabase at all

```bash
npm run demo
```

Runs the whole thing against a throwaway database on your own machine, with sign-in checking off.
Good for showing somebody the screens. Never use it for real visitors.

---

## What each role can do

| | Reception | Host | Manager | Admin |
|---|---|---|---|---|
| Check visitors in and out | yes | | yes | yes |
| Contacts | yes | | yes | yes |
| See their own visitors and answer them | | yes | yes | yes |
| Appointments | book | own | all | all |
| Reports and audit trail | | | yes | yes |
| Export | today, no email or birthday | own visitors | everything | everything |
| Full date of birth | | | yes | yes |
| Accounts, hosts, settings | | | | yes |
| Relationships, follow-ups, gift proposals | yes | | yes | yes |
| Approve a gift, restricted notes, PR export | | | yes | yes |

The API checks these on every request, and the database checks them again on its own, so a
mistake in one layer is not enough to leak anything.

---

## The rules built into it

- **Contact codes** run AP-C-000001 upwards, are never reused and can never be edited.
- **Mobile numbers** are tidied into one form (+91 unless a country code is typed).
- **Possible duplicates** — same mobile, same email, or almost the same name — are shown to
  reception, who picks the existing person or confirms a new one. Nothing is ever merged on its own.
- **One active visit per person.** A second check-in is refused until the first is closed.
- **Check-out is never before check-in**, and cancelling or denying always needs a reason.
- **A visit still open after 3 hours** is flagged for review. It is never closed automatically and
  never given an invented leaving time.
- **Meeting location** follows the rules, first match first: Amit with a client or vendor goes to the
  Board room on the 3rd floor; Amit with anybody else goes to his cabin; any interview goes to the
  interview room; Poonam Ma'am's visitors go to her cabin; everybody else goes to their host's cabin.
  Reception can override it for one visit.
- **Wellness visits** record only "Wellness session", and their remarks stay between the visitor,
  the host they came to see, and the Manager.
- **Date of birth** is not a readable column for reception; they see "24 May" without the year.
- **Every change is logged** with who made it. Nobody can edit or delete that log, and a date of
  birth is never copied into it.

---

## The two workspaces

The register and the relationships are the same people. A visitor who becomes
somebody the office keeps in touch with keeps the contact code they already had;
nobody is ever entered twice.

**Visitors** — check in, the live board, host replies, appointments and the
meeting day, the register and its reports.

**Relationships** — the directory with categories, owner and priority; a dated
timeline of calls, meetings, visits and events; follow-ups with overdue chasing;
gift records with approval; business cards and other files; and permission to
contact, recorded per channel.

### The rules the PR side keeps
- A relationship record needs the person's email address and date of birth. A
  walk-in visitor still needs only a name and a mobile number.
- One person can be a Client and a Vendor and Media at once, without copies.
- **Every outgoing gift waits for a manager**, and nobody can approve a gift
  they proposed themselves. The database refuses it, not just the screen.
- The same person, occasion, year and direction is flagged as a possible repeat;
  going ahead takes a written reason.
- A gift worth nothing has to say why. Planned and actual values are reported
  separately so spending is never counted twice.
- Somebody marked **No gifts** cannot be sent one without an explanation.
- A visit, a birthday on file or a relationship record is **never** permission to
  market to somebody. Permission is recorded per channel with its source, every
  opt-out is kept, and **Do not contact** overrules anything agreed earlier.
- Birthdays and anniversaries are shown without the birth year. A 29 February
  birthday falls on 28 February in ordinary years, changeable to 1 March.
- Restricted notes are for the Manager and the Admin.
- Every change is in the same audit trail as the visitor side.

---

## WhatsApp alerts through Make.com

The in-app alert always works. WhatsApp is the extra, and it never holds reception up.

1. In Make, start a scenario with a **Custom webhook** and copy its address.
2. In the app: **Admin → WhatsApp alerts**, paste it in and tick the box.
3. In **Admin → Hosts**, give each host their mobile number.

Each check-in and each reminder sends Make:

```json
{ "event": "visitor.waiting", "visitId": 42, "visitorName": "Anita Sharma",
  "visitorMobile": "+919829000001", "organisation": "Sharma Constructions",
  "visitorType": "Client", "purpose": "Project discussion",
  "hostName": "Amit Khandelwal", "hostMobile": "+919829012345",
  "room": "Board room", "floor": "3rd", "checkInAt": "2026-10-29T05:30:00.000Z" }
```

Point that at your approved WhatsApp template and send it from the EKASA number.

---

## The folders

```
supabase/     the database: migrations, and a test that checks the rules it enforces
backend/      the API: domain rules, repositories, routes, tests
  src/domain/     the office rules on their own, with no database behind them
  src/routes/     one file per part of the app
  src/testing/    the test harness and the demo server (not part of the real build)
frontend/     the screens: React, TypeScript, Tailwind, light theme
                visitors: check-in, live board, appointments, contacts, reports
                relationships: directory, timeline, follow-ups, gifts, permission, files
docs/         the API reference and how to put it online
```

## Tests

```bash
npm test        # 107 checks of the API, as each role, against a real Postgres
npm run test:db # 91 checks of what the database enforces on its own
```

Both start a throwaway Postgres, run the same migrations as your Supabase project, and stop again.

## Before the office relies on it

- Turn off public sign-up: **Supabase → Authentication → Sign In / Providers → Email → Allow new users to sign up: off.** The Admin then adds people under Users.
- Keep `backend/.env` out of GitHub. It is already in `.gitignore`.
- Supabase's free plan has no backups and pauses after a week of no use. For daily office use,
  either move to the Pro plan or take a weekly dump: `pg_dump "$DATABASE_URL" > backup.sql`.
- See `docs/DEPLOY.md` for putting it on the Hostinger server.
