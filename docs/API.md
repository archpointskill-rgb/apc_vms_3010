# The API

Everything lives under `/api`. Every request except `/api/health` needs the Supabase access
token the web app receives when somebody signs in:

```
Authorization: Bearer <token>
```

The API checks the token with Supabase, then loads the staff record fresh on every request, so a
role change or a switched-off account takes effect at once rather than when the token expires.

| Method and path | Who | What it does |
|---|---|---|
| `GET /health` | anyone | is the API up |
| `GET /me` | signed in | the signed-in person and the list of what their role may do |
| `GET /hosts` `/rooms` `/rules` `/notice` | signed in | the office's master data |
| `GET /suggest-room?hostId=&visitorType=` | signed in | the room the rules choose |
| `PATCH /hosts/:id` | Admin | floor, default room, WhatsApp number |
| `GET /settings/:key`, `PUT /settings/:key` | read: signed in, write: Admin | the notice text, the Make.com webhook |
| `GET /contacts?q=` | Reception, Manager, Admin | search by name, mobile, email, organisation or code |
| `GET /contacts/:id` | same | one contact with its visit history |
| `POST /contacts` | same | create. **409** with `duplicates` when somebody similar exists; send again with `confirmNew: true` to go ahead |
| `PATCH /contacts/:id` | same | edit |
| `POST /contacts/check-duplicates` | same | warn before creating |
| `GET /visits` | all (a host sees only their own) | the live board: everyone still here, plus today |
| `GET /visits/:id` | same | one visit |
| `POST /visits` | Reception, Manager, Admin | check in. Leave `hostId` out for the Unassigned queue |
| `POST /visits/:id/start` | same | send the visitor in |
| `POST /visits/:id/check-out` | same | they have left |
| `POST /visits/:id/cancel` `/deny` | same | needs `{ "reason": "…" }` |
| `POST /visits/:id/reply` | the visit's host, or the desk | `{ "reply": "Send in" \| "Wait 10 minutes" \| "Can't meet today" \| "Reschedule" }` |
| `POST /visits/:id/assign` | Reception, Manager, Admin | give an Unassigned visitor a host |
| `POST /visits/:id/remind` | same | nudge the host again |
| `GET /notifications`, `POST /notifications/read` | Host | the in-app alerts |
| `GET /appointments?from=&to=` | signed in (a host sees their own) | bookings and any room clash |
| `GET /appointments/day/:date` | same | the meeting-day timeline for one day |
| `POST /appointments` | Reception, Manager, Admin, or a host for themselves | book |
| `POST /appointments/:id/approve` `/decline` | the host it is booked with, Manager, Admin | answer it |
| `PATCH /appointments/:id` | Reception, Manager, Admin | move the slot |
| `GET /reports/summary` | Manager, Admin | the dashboard numbers and charts |
| `GET /reports/on-premises` | signed in | who is in the building now |
| `GET /export/visits.csv` | all, scoped by role | the register as a spreadsheet |
| `GET /audit` | Manager, Admin | the last changes, newest first |
| `GET /staff`, `PATCH /staff/:id` | Admin | roles, host links, switching accounts on and off |

## Public Relations

The second workspace, on the same contact record. Reception, Manager and Admin
use it; hosts have no part in it.

| Method and path | Who | What it does |
|---|---|---|
| `GET /pr?q=&category=&priority=&status=&owner=&tag=` | desk | the relationship directory |
| `GET /pr/summary` | desk | counts, and the split by category |
| `GET /pr/upcoming?days=` | desk | birthdays and key dates coming up, never with a birth year |
| `GET /pr/tasks?mine=1&overdue=1&status=` | desk | follow-ups |
| `PATCH /pr/tasks/:id` | desk | change the status, date, wording or owner |
| `GET /pr/gifts?pending=1&direction=&status=` | desk | gift records |
| `GET /pr/gifts/spend?from=&to=` | Manager, Admin | planned and actual totals, kept apart |
| `GET /pr/:contactId` | desk | one relationship with its timeline, follow-ups, gifts, files and permission |
| `POST /pr/:contactId` | desk | open a relationship on an existing contact. **400** if the contact has no email or date of birth; **409** if one already exists |
| `PATCH /pr/:contactId` | desk | categories, owner, priority, gift tier, status, source and the rest |
| `DELETE /pr/:contactId` | Manager, Admin | close the relationship. The person and their visits stay |
| `POST /pr/:contactId/notes` | desk | a dated note. `restricted: true` needs Manager or Admin |
| `POST /pr/:contactId/key-dates`, `DELETE .../key-dates/:id` | desk | anniversaries and the like |
| `POST /pr/:contactId/interactions` | desk | record what happened. `nextAction` also creates a follow-up |
| `POST /pr/:contactId/tasks` | desk | add a follow-up |
| `POST /pr/:contactId/gifts` | desk | propose a gift. **409** with `duplicates` for the same person, occasion and year; resend with `overrideReason` |
| `POST /pr/gifts/:id/approve` `/decline` `/acknowledge` | Manager, Admin | decide on it; never your own proposal |
| `POST /pr/gifts/:id/dispatch` `/complete` `/cancel` `/return` | desk | move it along; `complete` needs `actualValue` and `completedOn` |
| `GET`, `POST /pr/:contactId/consent` | desk | permission per channel, with its source and full history |
| `POST /pr/:contactId/attachments` | desk | record a file already uploaded to storage |
| `DELETE /pr/attachments/:id` | Manager, Admin | remove one |
| `GET /pr/export/directory.csv?purpose=promotional` | Manager, Admin | the directory. With `purpose=promotional`, anyone not Active is left out |

Files go straight from the browser to the private `pr-attachments` bucket under
`pr/<contactId>/…`, then the path is recorded through the API, which refuses a
path belonging to a different contact.

Errors come back as `{ "error": "a sentence a receptionist can act on" }` with a sensible status:
400 bad request, 401 not signed in, 403 role not allowed, 404 gone, 409 clash.

## Functions in the database

These exist so the rules hold even for somebody connecting straight to Postgres:

- `public.suggest_room(host_id, visitor_type)` — the meeting-location rules
- `public.room_clashes(from, to)` — overlapping bookings for the same room
- `public.reply_to_visit(visit_id, reply, reason)` — a host's answer, and nothing else on the visit
- `public.contact_dob(contact_id)` — the full date of birth, for Manager and Admin only
- `public.contact_birthday(contact_id)` — "24 May", for any signed-in staff member

Supabase's security linter still lists these five as callable by signed-in users. That is on
purpose: each one checks the caller's role inside itself before it returns anything.
