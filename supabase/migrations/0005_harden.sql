-- Closes the warnings Supabase's security linter raises on a fresh schema.
--
-- 1. Every function pins its search_path, so nobody can shadow a name it calls.
-- 2. Trigger functions and internal helpers are not callable over the REST API.
--    Only the five functions the app genuinely calls stay callable, and only
--    once signed in.

create or replace function private.actor_id() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('app.actor_id', true), '')::uuid, auth.uid())
$$;

create or replace function private.is_desk() returns boolean
language sql stable set search_path = '' as $$
  select private.has_role(array['reception','manager','admin']::public.app_role[])
$$;

-- Nothing in public is callable by an anonymous visitor, and trigger functions
-- are callable by nobody: a trigger fires under the table's own rights.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
  end loop;
end $$;

grant execute on function public.contact_dob(bigint)                               to authenticated;
grant execute on function public.contact_birthday(bigint)                          to authenticated;
grant execute on function public.suggest_room(bigint, public.visitor_type)         to authenticated;
grant execute on function public.room_clashes(timestamptz, timestamptz)            to authenticated;
grant execute on function public.reply_to_visit(bigint, public.host_reply, text)   to authenticated;

-- The private helpers stay callable by signed-in users only, because row level
-- security policies evaluate them as the signed-in role.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format('revoke all on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated', f.signature);
  end loop;
end $$;
