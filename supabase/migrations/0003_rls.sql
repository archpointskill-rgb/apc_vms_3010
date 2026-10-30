-- Row level security. The API is the main gate; these rules are the second one,
-- so a stolen anon key still cannot read or change what it should not.

alter table public.rooms          enable row level security;
alter table public.hosts          enable row level security;
alter table public.location_rules enable row level security;
alter table public.staff          enable row level security;
alter table public.contacts       enable row level security;
alter table public.appointments   enable row level security;
alter table public.visits         enable row level security;
alter table public.notifications  enable row level security;
alter table public.audit_log      enable row level security;
alter table public.settings       enable row level security;

-- Nothing is readable without signing in.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

-- ---------------------------------------------------------------- master data
create policy rooms_read  on public.rooms  for select to authenticated using ((select private.is_office()));
create policy rooms_write on public.rooms  for all    to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])))
  with check ((select private.has_role(array['admin']::public.app_role[])));

create policy hosts_read  on public.hosts  for select to authenticated using ((select private.is_office()));
create policy hosts_write on public.hosts  for all    to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])))
  with check ((select private.has_role(array['admin']::public.app_role[])));

create policy rules_read  on public.location_rules for select to authenticated using ((select private.is_office()));
create policy rules_write on public.location_rules for all    to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])))
  with check ((select private.has_role(array['admin']::public.app_role[])));

-- ---------------------------------------------------------------- staff
-- Everyone reads their own row; only the Admin reads or changes the rest.
create policy staff_read_self on public.staff for select to authenticated
  using (id = (select private.actor_id()) or (select private.has_role(array['admin']::public.app_role[])));
create policy staff_admin_write on public.staff for all to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])))
  with check ((select private.has_role(array['admin']::public.app_role[])));

-- ---------------------------------------------------------------- contacts
-- A host sees only the people who have actually visited them.
create policy contacts_read on public.contacts for select to authenticated using (
  (select private.is_desk())
  or exists (select 1 from public.visits v
             where v.contact_id = contacts.id and v.host_id = (select private.my_host_id()))
);
create policy contacts_insert on public.contacts for insert to authenticated
  with check ((select private.is_desk()));
create policy contacts_update on public.contacts for update to authenticated
  using ((select private.is_desk())) with check ((select private.is_desk()));
create policy contacts_delete on public.contacts for delete to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])));

-- Date of birth is not a readable column: Manager and Admin get it from contact_dob().
revoke select on public.contacts from authenticated;
grant select (id, contact_code, full_name, mobile, email, address, organisation, designation,
              notes, is_sample, is_pr_contact, created_by, created_at, updated_by, updated_at)
  on public.contacts to authenticated;
grant insert, update, delete on public.contacts to authenticated;

create or replace function public.contact_dob(_contact_id bigint) returns date
language sql stable security definer set search_path = '' as $$
  select c.date_of_birth from public.contacts c
  where c.id = _contact_id and private.has_role(array['manager','admin']::public.app_role[])
$$;

-- Reception needs the day and month only, for a birthday greeting.
create or replace function public.contact_birthday(_contact_id bigint) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(c.date_of_birth, 'DD Mon') from public.contacts c
  where c.id = _contact_id and private.is_office()
$$;

grant execute on function public.contact_dob(bigint), public.contact_birthday(bigint) to authenticated;

-- ---------------------------------------------------------------- visits
create policy visits_read on public.visits for select to authenticated using (
  (select private.is_desk()) or (host_id is not null and host_id = (select private.my_host_id()))
);
create policy visits_write on public.visits for all to authenticated
  using ((select private.is_desk())) with check ((select private.is_desk()));

-- A host answers through this function, so they can change nothing else on the visit.
create or replace function public.reply_to_visit(_visit_id bigint, _reply public.host_reply, _reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.visits;
begin
  select * into v from public.visits where id = _visit_id;
  if v.id is null then raise exception 'Visit not found.'; end if;
  if not (private.is_desk() or (v.host_id is not null and v.host_id = private.my_host_id())) then
    raise exception 'Only the host of this visit can reply.' using errcode = 'insufficient_privilege';
  end if;
  if v.status not in ('Waiting', 'In meeting') then
    raise exception 'This visit is no longer active.' using errcode = 'check_violation';
  end if;

  if _reply = 'Can''t meet today' then
    update public.visits set reply = _reply, replied_at = now(), status = 'Denied',
           reason = coalesce(nullif(trim(_reason), ''), 'The host could not meet today'), check_out = now()
     where id = _visit_id;
  elsif _reply = 'Wait 10 minutes' then
    update public.visits set reply = _reply, replied_at = now(), wait_until = now() + interval '10 minutes'
     where id = _visit_id;
  else                                  -- Send in, Reschedule
    update public.visits set reply = _reply, replied_at = now(), wait_until = null where id = _visit_id;
  end if;
end $$;
grant execute on function public.reply_to_visit(bigint, public.host_reply, text) to authenticated;

-- ---------------------------------------------------------------- appointments
create policy appointments_read on public.appointments for select to authenticated using (
  (select private.is_desk()) or host_id = (select private.my_host_id())
);
create policy appointments_insert on public.appointments for insert to authenticated
  with check ((select private.is_desk()) or host_id = (select private.my_host_id()));
create policy appointments_update on public.appointments for update to authenticated
  using ((select private.is_desk()) or host_id = (select private.my_host_id()))
  with check ((select private.is_desk()) or host_id = (select private.my_host_id()));
create policy appointments_delete on public.appointments for delete to authenticated
  using ((select private.has_role(array['manager','admin']::public.app_role[])));

-- ---------------------------------------------------------------- alerts
create policy notifications_read on public.notifications for select to authenticated using (
  (select private.is_desk()) or host_id = (select private.my_host_id())
);
create policy notifications_update on public.notifications for update to authenticated
  using (host_id = (select private.my_host_id())) with check (host_id = (select private.my_host_id()));

-- ---------------------------------------------------------------- audit and settings
create policy audit_read on public.audit_log for select to authenticated
  using ((select private.has_role(array['manager','admin']::public.app_role[])));
-- No insert, update or delete policy exists: only the audit trigger writes here.

create policy settings_read  on public.settings for select to authenticated using ((select private.is_office()));
create policy settings_write on public.settings for all to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])))
  with check ((select private.has_role(array['admin']::public.app_role[])));
