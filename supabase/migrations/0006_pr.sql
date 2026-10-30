-- Public Relations: the second workspace, on the same contact record.
--
-- Nothing here duplicates a person. A PR profile hangs off public.contacts, so a
-- visitor who becomes a relationship keeps the contact code they already had.

-- ---------------------------------------------------------------- enums
do $$ begin
  create type pr_category as enum (
    'Team', 'Client', 'Known or Acquaintance', 'Contractor', 'Vendor',
    'Consultant', 'Partner', 'Prospect', 'Media', 'Other');
  create type pr_priority       as enum ('Standard', 'Important', 'Key relationship');
  create type pr_contact_status as enum ('Active', 'Inactive', 'Archived', 'Do not contact');
  create type gift_tier         as enum ('Standard', 'Premium', 'Custom', 'No gifts');
  create type pr_source         as enum ('Visit', 'Referral', 'Event', 'Website', 'Social media', 'Import', 'Direct contact');
  create type interaction_type  as enum ('Call', 'Meeting', 'Office visit', 'Email', 'Event', 'Referral', 'Gift', 'Other');
  create type task_status       as enum ('Open', 'In progress', 'Completed', 'Cancelled');
  create type gift_direction    as enum ('Given', 'Received');
  create type gift_status       as enum ('Planned', 'Pending approval', 'Approved', 'Dispatched', 'Delivered', 'Received', 'Cancelled', 'Returned');
  create type contact_channel   as enum ('Email', 'WhatsApp', 'Phone', 'SMS');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- the profile
-- One per contact, and only for the contacts the office actually keeps a
-- relationship with. A visitor without one is simply a visitor.
create table if not exists public.pr_profiles (
  contact_id      bigint primary key references public.contacts (id) on delete cascade,
  categories      pr_category[] not null default array['Other']::pr_category[]
                    check (cardinality(categories) between 1 and 10),
  owner_id        uuid references public.staff (id) on delete set null,   -- the relationship owner
  introduction    text,                                                   -- short professional background
  priority        pr_priority not null default 'Standard',
  gift_tier       gift_tier not null default 'Standard',
  source          pr_source,
  introduced_by   bigint references public.contacts (id) on delete set null,
  industry        text,
  interests       text,
  organisation_note text,
  preferred_channel contact_channel,
  preferred_language text,
  best_time       text,
  tags            text[] not null default '{}'::text[] check (cardinality(tags) <= 25),
  status          pr_contact_status not null default 'Active',
  reference_staff_id uuid references public.staff (id) on delete set null, -- optional internal reference
  created_by      uuid references public.staff (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_by      uuid references public.staff (id) on delete set null,
  updated_at      timestamptz not null default now()
);
create index if not exists pr_profiles_owner_idx    on public.pr_profiles (owner_id);
create index if not exists pr_profiles_status_idx   on public.pr_profiles (status);
create index if not exists pr_profiles_priority_idx on public.pr_profiles (priority);
create index if not exists pr_profiles_categories_idx on public.pr_profiles using gin (categories);
create index if not exists pr_profiles_tags_idx     on public.pr_profiles using gin (tags);
create index if not exists pr_profiles_introduced_idx on public.pr_profiles (introduced_by);
create index if not exists pr_profiles_reference_idx on public.pr_profiles (reference_staff_id);
create index if not exists pr_profiles_created_by_idx on public.pr_profiles (created_by);
create index if not exists pr_profiles_updated_by_idx on public.pr_profiles (updated_by);

-- Dated notes, each with its author. A restricted note is for Manager and Admin only.
create table if not exists public.pr_notes (
  id         bigint generated always as identity primary key,
  contact_id bigint not null references public.contacts (id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  restricted boolean not null default false,
  author_id  uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pr_notes_contact_idx on public.pr_notes (contact_id, created_at desc);
create index if not exists pr_notes_author_idx  on public.pr_notes (author_id);

-- Key dates other than the birthday, which already lives on the contact.
create table if not exists public.pr_key_dates (
  id         bigint generated always as identity primary key,
  contact_id bigint not null references public.contacts (id) on delete cascade,
  occasion   text not null check (length(trim(occasion)) > 0),
  on_date    date not null,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contact_id, occasion, on_date)
);
create index if not exists pr_key_dates_month_idx on public.pr_key_dates
  (extract(month from on_date), extract(day from on_date));

-- ---------------------------------------------------------------- interactions
-- A record of something that happened. Writing one here never sends anything.
create table if not exists public.pr_interactions (
  id           bigint generated always as identity primary key,
  contact_id   bigint not null references public.contacts (id) on delete cascade,
  kind         interaction_type not null,
  happened_at  timestamptz not null default now(),
  summary      text not null check (length(trim(summary)) > 0),
  outcome      text,
  visit_id     bigint references public.visits (id) on delete set null,
  gift_id      bigint,                                   -- filled in below, once gifts exist
  project      text,
  staff_id     uuid references public.staff (id) on delete set null,  -- who dealt with them
  created_by   uuid references public.staff (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint happened_at_is_not_in_the_future check (happened_at <= now() + interval '1 day')
);
create index if not exists pr_interactions_contact_idx on public.pr_interactions (contact_id, happened_at desc);
create index if not exists pr_interactions_visit_idx   on public.pr_interactions (visit_id);
create index if not exists pr_interactions_staff_idx   on public.pr_interactions (staff_id);
create index if not exists pr_interactions_created_by_idx on public.pr_interactions (created_by);

-- ---------------------------------------------------------------- follow-up tasks
create table if not exists public.pr_tasks (
  id           bigint generated always as identity primary key,
  contact_id   bigint not null references public.contacts (id) on delete cascade,
  description  text not null check (length(trim(description)) > 0),
  due_on       date not null,
  owner_id     uuid not null references public.staff (id) on delete restrict,
  status       task_status not null default 'Open',
  completed_at timestamptz,
  created_by   uuid references public.staff (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint finished_tasks_have_a_time
    check ((status in ('Completed', 'Cancelled')) = (completed_at is not null))
);
create index if not exists pr_tasks_open_idx    on public.pr_tasks (due_on) where status in ('Open', 'In progress');
create index if not exists pr_tasks_owner_idx   on public.pr_tasks (owner_id, status);
create index if not exists pr_tasks_contact_idx on public.pr_tasks (contact_id);
create index if not exists pr_tasks_created_by_idx on public.pr_tasks (created_by);

-- ---------------------------------------------------------------- gifts
create table if not exists public.pr_gifts (
  id             bigint generated always as identity primary key,
  contact_id     bigint not null references public.contacts (id) on delete cascade,
  direction      gift_direction not null,
  occasion       text not null check (length(trim(occasion)) > 0),
  item           text not null check (length(trim(item)) > 0),
  tier           gift_tier not null,                     -- snapshot of the tier used for this gift
  planned_on     date not null,
  planned_value  numeric(12, 2) not null check (planned_value >= 0),
  zero_value_reason text,
  currency       text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status         gift_status not null default 'Planned',
  approved_by    uuid references public.staff (id) on delete set null,
  approved_at    timestamptz,
  decision_note  text,
  actual_value   numeric(12, 2) check (actual_value is null or actual_value >= 0),
  completed_on   date,
  supplier       text,
  tracking       text,
  delivery_note  text,
  override_reason text,                                   -- why a duplicate warning was ignored
  created_by     uuid references public.staff (id) on delete set null,
  created_at     timestamptz not null default now(),
  -- a gift worth nothing has to say why
  constraint zero_value_needs_a_reason
    check (planned_value > 0 or length(trim(coalesce(zero_value_reason, ''))) > 0),
  -- an approval records who made it and when
  constraint approval_records_who_and_when
    check ((approved_by is null) = (approved_at is null)),
  -- nobody approves their own proposal
  constraint nobody_approves_their_own_gift
    check (approved_by is null or approved_by is distinct from created_by),
  -- a finished gift says what it really cost and when it happened
  constraint finished_gifts_are_complete
    check (status not in ('Delivered', 'Received') or (completed_on is not null and actual_value is not null)),
  -- these states are only reachable once somebody approved
  constraint dispatched_gifts_were_approved
    check (status not in ('Approved', 'Dispatched', 'Delivered') or approved_by is not null)
);
create index if not exists pr_gifts_contact_idx on public.pr_gifts (contact_id, planned_on desc);
create index if not exists pr_gifts_status_idx  on public.pr_gifts (status) where status = 'Pending approval';
create index if not exists pr_gifts_created_by_idx on public.pr_gifts (created_by);
create index if not exists pr_gifts_approved_by_idx on public.pr_gifts (approved_by);

do $$ begin
  alter table public.pr_interactions
    add constraint pr_interactions_gift_id_fkey foreign key (gift_id) references public.pr_gifts (id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists pr_interactions_gift_idx on public.pr_interactions (gift_id);

-- ---------------------------------------------------------------- consent
-- Permission to send somebody something is recorded on its own, per channel,
-- with where it came from and when. A visit, a birthday or a PR profile is
-- never treated as permission.
create table if not exists public.pr_consents (
  id          bigint generated always as identity primary key,
  contact_id  bigint not null references public.contacts (id) on delete cascade,
  channel     contact_channel not null,
  opted_in    boolean not null,
  source      text not null check (length(trim(source)) > 0),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.staff (id) on delete set null
);
create index if not exists pr_consents_contact_idx on public.pr_consents (contact_id, channel, recorded_at desc);
create index if not exists pr_consents_recorded_by_idx on public.pr_consents (recorded_by);

-- The answer that counts right now: the newest entry per channel.
create or replace view public.pr_current_consent as
  select distinct on (contact_id, channel)
         contact_id, channel, opted_in, source, recorded_at
    from public.pr_consents
   order by contact_id, channel, recorded_at desc, id desc;

-- Who may be sent a promotional message: opted in, and not marked Do not contact.
create or replace function public.pr_may_contact(_contact_id bigint, _channel contact_channel)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.opted_in from public.pr_current_consent c
      where c.contact_id = _contact_id and c.channel = _channel), false)
    and not exists (
      select 1 from public.pr_profiles p
       where p.contact_id = _contact_id and p.status = 'Do not contact')
$$;

-- ---------------------------------------------------------------- attachments
-- Business cards and similar. The file itself lives in Supabase storage; this
-- row is what the app lists and what permissions are checked against.
create table if not exists public.pr_attachments (
  id          bigint generated always as identity primary key,
  contact_id  bigint not null references public.contacts (id) on delete cascade,
  storage_path text not null unique,
  file_name   text not null,
  content_type text,
  size_bytes  bigint check (size_bytes is null or size_bytes between 1 and 10485760),
  caption     text,
  uploaded_by uuid references public.staff (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists pr_attachments_contact_idx on public.pr_attachments (contact_id, created_at desc);
create index if not exists pr_attachments_uploaded_by_idx on public.pr_attachments (uploaded_by);

-- ---------------------------------------------------------------- triggers
create or replace function public.touch_pr_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := private.actor_id();
  return new;
end $$;

drop trigger if exists pr_profiles_touch on public.pr_profiles;
create trigger pr_profiles_touch before update on public.pr_profiles
  for each row execute function public.touch_pr_profile();

-- A contact with a PR profile is a PR contact, and the database already insists
-- such a contact has an email address and a date of birth.
create or replace function public.mark_contact_as_pr() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.contacts set is_pr_contact = false where id = old.contact_id;
    return null;
  end if;
  update public.contacts set is_pr_contact = true where id = new.contact_id;
  return null;
end $$;

drop trigger if exists pr_profiles_flag_contact on public.pr_profiles;
create trigger pr_profiles_flag_contact after insert or delete on public.pr_profiles
  for each row execute function public.mark_contact_as_pr();

-- A completed or cancelled task records when it finished; reopening clears it.
create or replace function public.stamp_task_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status in ('Completed', 'Cancelled') and new.completed_at is null then
    new.completed_at := now();
  elsif new.status in ('Open', 'In progress') then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists pr_tasks_stamp on public.pr_tasks;
create trigger pr_tasks_stamp before insert or update on public.pr_tasks
  for each row execute function public.stamp_task_completion();

-- Everything here is audited, like the rest of the app.
do $$
declare t text;
begin
  foreach t in array array['pr_profiles','pr_notes','pr_key_dates','pr_interactions','pr_tasks','pr_gifts','pr_consents','pr_attachments'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.write_audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers
-- A gift that looks like one already recorded: same person, occasion, year and direction.
create or replace function public.gift_duplicates(_contact_id bigint, _occasion text, _on date, _direction gift_direction)
returns table (id bigint, item text, planned_on date, status gift_status)
language sql stable security definer set search_path = '' as $$
  select g.id, g.item, g.planned_on, g.status
    from public.pr_gifts g
   where g.contact_id = _contact_id
     and lower(trim(g.occasion)) = lower(trim(_occasion))
     and extract(year from g.planned_on) = extract(year from _on)
     and g.direction = _direction
     and g.status <> 'Cancelled'
$$;

/*
  Birthdays and key dates coming up, without ever showing a birth year.
  A 29 February birthday is reminded on the day the office chose, which is kept
  in settings under 'pr' as leapDayReminder ("28 Feb" or "1 Mar").
*/
create or replace function public.pr_upcoming_dates(_days integer default 30)
returns table (contact_id bigint, contact_code text, full_name text, occasion text, on_day date, days_away integer)
language sql stable security definer set search_path = '' as $$
  with settings as (
    select coalesce(s.value ->> 'leapDayReminder', '28 Feb') as leap_day from public.settings s where s.key = 'pr'
  ),
  leap as (select coalesce((select leap_day from settings), '28 Feb') as leap_day),
  horizon as (select current_date as from_day, current_date + make_interval(days => greatest(_days, 1)) as to_day),
  birthdays as (
    select c.id, c.contact_code, c.full_name, 'Birthday'::text as occasion,
           case
             when extract(month from c.date_of_birth) = 2 and extract(day from c.date_of_birth) = 29
                  and not (extract(year from gs.day)::int % 4 = 0
                           and (extract(year from gs.day)::int % 100 <> 0 or extract(year from gs.day)::int % 400 = 0))
               then make_date(extract(year from gs.day)::int, 2, 28)
                    + case when (select leap_day from leap) = '1 Mar' then 1 else 0 end
             else make_date(extract(year from gs.day)::int,
                            extract(month from c.date_of_birth)::int,
                            extract(day from c.date_of_birth)::int)
           end as on_day
      from public.contacts c
      join public.pr_profiles p on p.contact_id = c.id and p.status <> 'Archived'
      cross join (select generate_series(date_trunc('year', current_date),
                                         date_trunc('year', current_date + interval '1 year'),
                                         interval '1 year')::date as day) gs
     where c.date_of_birth is not null
  ),
  key_dates as (
    select c.id, c.contact_code, c.full_name, k.occasion,
           make_date(extract(year from gs.day)::int, extract(month from k.on_date)::int,
                     least(extract(day from k.on_date)::int,
                           extract(day from (date_trunc('month', make_date(extract(year from gs.day)::int,
                             extract(month from k.on_date)::int, 1)) + interval '1 month - 1 day'))::int)) as on_day
      from public.pr_key_dates k
      join public.contacts c on c.id = k.contact_id
      join public.pr_profiles p on p.contact_id = c.id and p.status <> 'Archived'
      cross join (select generate_series(date_trunc('year', current_date),
                                         date_trunc('year', current_date + interval '1 year'),
                                         interval '1 year')::date as day) gs
  ),
  everything as (select * from birthdays union all select * from key_dates)
  select e.id, e.contact_code, e.full_name, e.occasion, e.on_day,
         (e.on_day - current_date)::int as days_away
    from everything e, horizon h
   where e.on_day >= h.from_day and e.on_day <= h.to_day
   order by e.on_day, e.full_name
$$;

-- ---------------------------------------------------------------- row level security
alter table public.pr_profiles    enable row level security;
alter table public.pr_notes       enable row level security;
alter table public.pr_key_dates   enable row level security;
alter table public.pr_interactions enable row level security;
alter table public.pr_tasks       enable row level security;
alter table public.pr_gifts       enable row level security;
alter table public.pr_consents    enable row level security;
alter table public.pr_attachments enable row level security;

-- Reception, Manager and Admin keep the PR records; hosts have no part in it.
do $$
declare t text;
begin
  foreach t in array array['pr_profiles','pr_key_dates','pr_interactions','pr_tasks','pr_consents','pr_attachments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_desk_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_desk_write', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_desk()))',
                   t || '_desk_read', t);
    execute format('create policy %I on public.%I for all to authenticated
                      using ((select private.is_desk())) with check ((select private.is_desk()))',
                   t || '_desk_write', t);
  end loop;
end $$;

-- A restricted note is for the Manager and the Admin only.
drop policy if exists pr_notes_read on public.pr_notes;
create policy pr_notes_read on public.pr_notes for select to authenticated using (
  (select private.has_role(array['manager','admin']::public.app_role[]))
  or (not restricted and (select private.is_desk()))
);
-- Writing is split from reading on purpose: a single "for all" policy would also
-- grant the read, and restricted notes would stop being restricted.
drop policy if exists pr_notes_write on public.pr_notes;
drop policy if exists pr_notes_add on public.pr_notes;
create policy pr_notes_add on public.pr_notes for insert to authenticated
  with check ((select private.is_desk()));
drop policy if exists pr_notes_change on public.pr_notes;
create policy pr_notes_change on public.pr_notes for update to authenticated
  using ((select private.has_role(array['manager','admin']::public.app_role[]))
         or (not restricted and (select private.is_desk())))
  with check ((select private.is_desk()));
drop policy if exists pr_notes_remove on public.pr_notes;
create policy pr_notes_remove on public.pr_notes for delete to authenticated
  using ((select private.has_role(array['manager','admin']::public.app_role[])));

-- Anyone at the desk may propose a gift; only a Manager or the Admin may decide on it.
drop policy if exists pr_gifts_read on public.pr_gifts;
create policy pr_gifts_read on public.pr_gifts for select to authenticated
  using ((select private.is_desk()));
drop policy if exists pr_gifts_propose on public.pr_gifts;
create policy pr_gifts_propose on public.pr_gifts for insert to authenticated
  with check ((select private.is_desk()));
drop policy if exists pr_gifts_change on public.pr_gifts;
create policy pr_gifts_change on public.pr_gifts for update to authenticated
  using ((select private.is_desk())) with check ((select private.is_desk()));
drop policy if exists pr_gifts_remove on public.pr_gifts;
create policy pr_gifts_remove on public.pr_gifts for delete to authenticated
  using ((select private.has_role(array['manager','admin']::public.app_role[])));

grant select on public.pr_current_consent to authenticated;
grant execute on function public.pr_may_contact(bigint, contact_channel) to authenticated;
grant execute on function public.gift_duplicates(bigint, text, date, gift_direction) to authenticated;
grant execute on function public.pr_upcoming_dates(integer) to authenticated;
revoke all on function public.touch_pr_profile(), public.mark_contact_as_pr(), public.stamp_task_completion()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- settings and storage
insert into public.settings (key, value) values
  ('pr', '{"leapDayReminder":"28 Feb","upcomingDays":30,"giftApproval":"every outgoing gift"}'::jsonb)
on conflict (key) do nothing;

-- A private bucket for business cards and similar. Only present on Supabase;
-- the local test database has no storage schema, so this part is skipped there.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('pr-attachments', 'pr-attachments', false, 10485760,
            array['image/png','image/jpeg','image/webp','application/pdf'])
    on conflict (id) do nothing;

    drop policy if exists pr_files_read on storage.objects;
    create policy pr_files_read on storage.objects for select to authenticated
      using (bucket_id = 'pr-attachments' and (select private.is_desk()));

    drop policy if exists pr_files_add on storage.objects;
    create policy pr_files_add on storage.objects for insert to authenticated
      with check (bucket_id = 'pr-attachments' and (select private.is_desk()));

    drop policy if exists pr_files_remove on storage.objects;
    create policy pr_files_remove on storage.objects for delete to authenticated
      using (bucket_id = 'pr-attachments'
             and (select private.has_role(array['manager','admin']::public.app_role[])));
  end if;
end $$;
