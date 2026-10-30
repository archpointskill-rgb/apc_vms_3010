-- Triggers, helper functions and the rules the database enforces on its own.

-- Who is acting: the API sets app.actor_id per transaction; a direct Supabase
-- client call falls back to the signed-in auth user.
create or replace function private.actor_id() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('app.actor_id', true), '')::uuid, auth.uid())
$$;

create or replace function private.actor_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff s where s.id = private.actor_id() and s.active
$$;

create or replace function private.has_role(_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.id = private.actor_id() and s.active and s.role = any(_roles)
  )
$$;

-- Reception, Manager and Admin: the people who run the desk.
create or replace function private.is_desk() returns boolean
language sql stable as $$ select private.has_role(array['reception','manager','admin']::public.app_role[]) $$;

create or replace function private.is_office() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.id = private.actor_id() and s.active)
$$;

-- The host record this sign-in belongs to (null unless it is a Host login).
create or replace function private.my_host_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select s.host_id from public.staff s where s.id = private.actor_id() and s.active
$$;

-- Row level security policies run as the signed-in role, so `authenticated`
-- must be able to call these helpers; `anon` must not.
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
revoke all on schema private from anon, public;
revoke execute on all functions in schema private from anon, public;

-- ---------------------------------------------------------------- staff
-- Every new Supabase Auth user gets a staff row. The very first one is the Admin.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.staff) into first_user;
  insert into public.staff (id, full_name, email, role, active)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
          new.email,
          (case when first_user then 'admin' else 'reception' end)::public.app_role,
          first_user)                      -- later sign-ups wait for the Admin to activate them
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Nobody can promote themselves.
create or replace function public.prevent_self_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id = private.actor_id() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You cannot change your own role or access.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists staff_no_self_promotion on public.staff;
create trigger staff_no_self_promotion before update on public.staff
  for each row execute function public.prevent_self_role_change();

-- ---------------------------------------------------------------- contacts
create or replace function public.touch_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := private.actor_id();
  return new;
end $$;

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- A contact code is issued once and never changes or repeats.
create or replace function public.lock_contact_code() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.contact_code is distinct from old.contact_code then
    raise exception 'The contact code cannot be changed.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists contacts_lock_code on public.contacts;
create trigger contacts_lock_code before update on public.contacts
  for each row execute function public.lock_contact_code();

-- ---------------------------------------------------------------- audit trail
-- Date of birth is deliberately never copied into the log.
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare body jsonb; rid text; who uuid; name text;
begin
  body := to_jsonb(coalesce(new, old)) - 'date_of_birth' - 'password' - 'search_vector';
  rid  := body ->> 'id';
  who  := private.actor_id();
  select s.full_name into name from public.staff s where s.id = who;
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, detail)
  values (who, name, lower(tg_op), tg_table_name, rid, body);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['contacts','visits','appointments','hosts','rooms','location_rules','staff'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.write_audit()', t || '_audit', t);
  end loop;
end $$;

-- The log is append only, for everyone.
create or replace function public.audit_is_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log cannot be changed.' using errcode = 'check_violation';
end $$;

drop trigger if exists audit_no_change on public.audit_log;
create trigger audit_no_change before update or delete on public.audit_log
  for each row execute function public.audit_is_append_only();

-- ---------------------------------------------------------------- host alerts
create or replace function public.alert_host_on_new_visit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare visitor text;
begin
  if new.host_id is not null then
    select c.full_name into visitor from public.contacts c where c.id = new.contact_id;
    insert into public.notifications (host_id, visit_id, body)
    values (new.host_id, new.id, coalesce(visitor, 'A visitor') || ' is waiting at reception.');
  end if;
  return null;
end $$;

drop trigger if exists visits_alert_host on public.visits;
create trigger visits_alert_host after insert on public.visits
  for each row execute function public.alert_host_on_new_visit();

-- ---------------------------------------------------------------- appointments
create or replace function public.set_appointment_slot() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.slot := tstzrange(new.starts_at, new.starts_at + make_interval(mins => new.duration_minutes), '[)');
  return new;
end $$;

drop trigger if exists appointments_set_slot on public.appointments;
create trigger appointments_set_slot before insert or update of starts_at, duration_minutes
  on public.appointments for each row execute function public.set_appointment_slot();

-- ---------------------------------------------------------------- meeting location
-- First matching rule wins, otherwise the host's default room.
create or replace function public.suggest_room(_host_id bigint, _visitor_type public.visitor_type)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.room_id from public.location_rules r
      where r.active
        and (r.host_id is null or r.host_id = _host_id)
        and (r.visitor_types is null or _visitor_type = any(r.visitor_types))
      order by r.priority
      limit 1),
    (select h.default_room_id from public.hosts h where h.id = _host_id)
  )
$$;

-- Live appointments that want the same room at an overlapping time.
create or replace function public.room_clashes(_from timestamptz, _to timestamptz)
returns table (room_id bigint, room_name text, a_id bigint, a_label text, b_id bigint, b_label text)
language sql stable security definer set search_path = '' as $$
  select a.room_id, rm.name,
         a.id, a.guest_name || ' ' || to_char(a.starts_at at time zone 'Asia/Kolkata', 'HH12:MI am'),
         b.id, b.guest_name || ' ' || to_char(b.starts_at at time zone 'Asia/Kolkata', 'HH12:MI am')
  from public.appointments a
  join public.appointments b
    on b.room_id = a.room_id and b.id > a.id and b.slot && a.slot and b.status <> 'Declined'
  join public.rooms rm on rm.id = a.room_id
  where a.status <> 'Declined' and a.room_id is not null and a.slot && tstzrange(_from, _to, '[)')
$$;

grant execute on function public.suggest_room(bigint, public.visitor_type) to authenticated;
grant execute on function public.room_clashes(timestamptz, timestamptz) to authenticated;
