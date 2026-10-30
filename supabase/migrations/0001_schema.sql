-- ArchPoint Visitors (VMS) — core schema
-- Conventions: lowercase identifiers, identity primary keys, constraints in the database.

create schema if not exists private;          -- helper functions, never exposed to API roles
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type app_role           as enum ('reception', 'host', 'manager', 'admin');
  create type floor_name         as enum ('Ground', '2nd', '3rd');
  create type visitor_type       as enum ('Client', 'Vendor and site vendor', 'Interview candidate', 'Wellness session');
  create type visit_status       as enum ('Waiting', 'In meeting', 'Checked out', 'Cancelled', 'Denied');
  create type appointment_status as enum ('Pending approval', 'Approved', 'Declined');
  create type host_reply         as enum ('Send in', 'Wait 10 minutes', 'Can''t meet today', 'Reschedule');
  create type visit_purpose      as enum ('Project discussion', 'Vendor quote', 'Site matter', 'Interview',
                                          'Wellness session', 'Payment or accounts', 'Delivery', 'Other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- master data
create table if not exists public.rooms (
  id         bigint generated always as identity primary key,
  name       text not null unique check (length(trim(name)) > 0),
  floor      floor_name not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.hosts (
  id              bigint generated always as identity primary key,
  name            text not null unique check (length(trim(name)) > 0),
  designation     text,
  department      text,
  floor           floor_name not null default '2nd',
  default_room_id bigint references public.rooms (id) on delete set null,
  -- E.164; used by the Make.com WhatsApp alert
  mobile          text check (mobile is null or mobile ~ '^\+[1-9][0-9]{7,14}$'),
  email           text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists hosts_default_room_idx on public.hosts (default_room_id);

-- First matching rule (lowest priority number) wins, else the host's default room.
create table if not exists public.location_rules (
  id            bigint generated always as identity primary key,
  priority      integer not null,
  host_id       bigint references public.hosts (id) on delete cascade,   -- null = any host
  visitor_types visitor_type[],                                          -- null = any type
  room_id       bigint not null references public.rooms (id) on delete cascade,
  active        boolean not null default true
);
create index if not exists location_rules_priority_idx on public.location_rules (priority) where active;
create index if not exists location_rules_host_idx     on public.location_rules (host_id);
create index if not exists location_rules_room_idx     on public.location_rules (room_id);

-- ---------------------------------------------------------------- staff (one row per sign-in)
create table if not exists public.staff (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  email      text not null,
  role       app_role not null default 'reception',
  host_id    bigint references public.hosts (id) on delete set null,     -- a Host login must point at a host
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint host_login_needs_host check (role <> 'host' or host_id is not null)
);
create index if not exists staff_host_idx on public.staff (host_id);

-- ---------------------------------------------------------------- contacts (shared with the later PR module)
create sequence if not exists public.contact_code_seq as bigint start 1;

create table if not exists public.contacts (
  id            bigint generated always as identity primary key,
  contact_code  text not null unique default ('AP-C-' || lpad(nextval('public.contact_code_seq')::text, 6, '0')),
  full_name     text not null check (length(trim(full_name)) > 0),
  mobile        text not null check (mobile ~ '^\+[1-9][0-9]{7,14}$'),
  email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  date_of_birth date check (date_of_birth is null or date_of_birth <= current_date),
  address       text,
  organisation  text,
  designation   text,
  notes         text,
  is_sample     boolean not null default false,
  is_pr_contact boolean not null default false,
  created_by    uuid references public.staff (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_by    uuid references public.staff (id) on delete set null,
  updated_at    timestamptz not null default now(),
  -- email and date of birth become mandatory only when promoted to a PR contact
  constraint pr_contact_needs_email_and_dob
    check (not is_pr_contact or (email is not null and date_of_birth is not null))
);
create index if not exists contacts_mobile_idx   on public.contacts (mobile);
create index if not exists contacts_email_idx    on public.contacts (lower(email)) where email is not null;
create index if not exists contacts_name_idx     on public.contacts (lower(full_name));
create index if not exists contacts_created_by_idx on public.contacts (created_by);

-- ---------------------------------------------------------------- appointments
create table if not exists public.appointments (
  id               bigint generated always as identity primary key,
  contact_id       bigint references public.contacts (id) on delete set null,
  guest_name       text not null check (length(trim(guest_name)) > 0),
  guest_mobile     text not null check (guest_mobile ~ '^\+[1-9][0-9]{7,14}$'),
  host_id          bigint not null references public.hosts (id) on delete cascade,
  visitor_type     visitor_type not null,
  purpose          visit_purpose not null,
  room_id          bigint references public.rooms (id) on delete set null,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 600),
  status           appointment_status not null default 'Pending approval',
  note             text,
  is_sample        boolean not null default false,
  created_by       uuid references public.staff (id) on delete set null,
  created_at       timestamptz not null default now(),
  -- the slot each appointment occupies, used for the room clash check
  -- The slot this booking occupies, kept in step by a trigger and used for the
  -- room clash check. (It cannot be a generated column: adding an interval to a
  -- timestamptz is only stable, not immutable.)
  slot             tstzrange not null default tstzrange(now(), now(), '[)')
);
create index if not exists appointments_starts_idx on public.appointments (starts_at);
create index if not exists appointments_host_idx   on public.appointments (host_id);
create index if not exists appointments_room_idx   on public.appointments (room_id);
create index if not exists appointments_slot_idx   on public.appointments using gist (slot);
create index if not exists appointments_contact_idx on public.appointments (contact_id);
create index if not exists appointments_created_by_idx on public.appointments (created_by);

-- ---------------------------------------------------------------- visits
create table if not exists public.visits (
  id             bigint generated always as identity primary key,
  contact_id     bigint not null references public.contacts (id) on delete restrict,
  host_id        bigint references public.hosts (id) on delete set null,   -- null = Unassigned queue
  visitor_type   visitor_type not null,
  purpose        visit_purpose not null,
  remarks        text,
  room_id        bigint references public.rooms (id) on delete set null,
  status         visit_status not null default 'Waiting',
  check_in       timestamptz not null default now(),
  check_out      timestamptz,
  reason         text,
  reply          host_reply,
  replied_at     timestamptz,
  wait_until     timestamptz,
  appointment_id bigint references public.appointments (id) on delete set null,
  reminders      integer not null default 0 check (reminders >= 0),
  notice_version text,
  notice_ack_at  timestamptz,
  is_sample      boolean not null default false,
  created_by     uuid references public.staff (id) on delete set null,
  constraint checkout_not_before_checkin check (check_out is null or check_out >= check_in),
  constraint closed_states_need_a_reason
    check (status not in ('Cancelled', 'Denied') or length(trim(coalesce(reason, ''))) > 0),
  constraint open_states_have_no_checkout
    check (status not in ('Waiting', 'In meeting') or check_out is null),
  -- a wellness visit records only "Wellness session" as its purpose
  constraint wellness_purpose_is_fixed
    check (visitor_type <> 'Wellness session' or purpose = 'Wellness session')
);
-- One active visit per contact: a second check-in is refused by the database.
create unique index if not exists visits_one_active_per_contact
  on public.visits (contact_id) where status in ('Waiting', 'In meeting');
create index if not exists visits_check_in_idx on public.visits (check_in desc);
create index if not exists visits_host_idx     on public.visits (host_id);
create index if not exists visits_contact_idx  on public.visits (contact_id);
create index if not exists visits_open_idx     on public.visits (check_in) where status in ('Waiting', 'In meeting');
create index if not exists visits_room_idx     on public.visits (room_id);
create index if not exists visits_appointment_idx on public.visits (appointment_id);
create index if not exists visits_created_by_idx  on public.visits (created_by);

-- ---------------------------------------------------------------- host alerts
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  host_id    bigint not null references public.hosts (id) on delete cascade,
  visit_id   bigint references public.visits (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_host_idx   on public.notifications (host_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (host_id) where read_at is null;
create index if not exists notifications_visit_idx  on public.notifications (visit_id);

-- ---------------------------------------------------------------- audit (append only)
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,
  actor_name text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb
);
create index if not exists audit_at_idx     on public.audit_log (at desc);
create index if not exists audit_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------- settings
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
