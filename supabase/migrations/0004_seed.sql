-- ArchPoint starter data: rooms, hosts and the meeting-location rules.
-- Floors for Yogendra, Yogendra Choudhary and Satveer Ji are assumed to be the 2nd floor,
-- and the interview room is a placeholder. The Admin can edit all of it in the app.

insert into public.rooms (name, floor) values
  ('Reception and waiting',     'Ground'),
  ('Poonam Ma''am cabin',       'Ground'),
  ('Amit cabin',                '2nd'),
  ('Vasudha cabin',             '2nd'),
  ('Neha cabin',                '2nd'),
  ('Vartika cabin',             '2nd'),
  ('Yogendra cabin',            '2nd'),
  ('Yogendra Choudhary cabin',  '2nd'),
  ('Satveer cabin',             '2nd'),
  ('Interview room',            '2nd'),
  ('Board room',                '3rd')
on conflict (name) do nothing;

insert into public.hosts (name, designation, department, floor, default_room_id)
select v.name, v.designation, v.department, v.floor::floor_name, r.id
from (values
  ('Poonam Ma''am',      'Arch Point Wellness', 'Wellness',   'Ground', 'Poonam Ma''am cabin'),
  ('Amit Khandelwal',    'CMD',                 'Management', '2nd',    'Amit cabin'),
  ('Vasudha Goyal',      'Director of Design',  'Design',     '2nd',    'Vasudha cabin'),
  ('Neha Sharma',        'COO',                 'Operations', '2nd',    'Neha cabin'),
  ('Vartika Maheshwari', 'HR and interviews',   'HR',         '2nd',    'Vartika cabin'),
  ('Yogendra',           'Architect',           'Design',     '2nd',    'Yogendra cabin'),
  ('Yogendra Choudhary', 'Civil Engineer',      'Operations', '2nd',    'Yogendra Choudhary cabin'),
  ('Satveer Ji',          null,                 'Operations', '2nd',    'Satveer cabin')
) as v(name, designation, department, floor, room)
join public.rooms r on r.name = v.room
on conflict (name) do nothing;

insert into public.location_rules (priority, host_id, visitor_types, room_id)
select v.priority, h.id, v.types, r.id
from (values
  (1, 'Amit Khandelwal', array['Client','Vendor and site vendor']::visitor_type[], 'Board room'),
  (2, 'Amit Khandelwal', null::visitor_type[],                                     'Amit cabin'),
  (3, null,              array['Interview candidate']::visitor_type[],             'Interview room'),
  (4, 'Poonam Ma''am',   null::visitor_type[],                                     'Poonam Ma''am cabin')
) as v(priority, host, types, room)
left join public.hosts h on h.name = v.host
join public.rooms r on r.name = v.room
where not exists (select 1 from public.location_rules);

insert into public.settings (key, value) values
  ('notice', '{"version":"v1","text":"The office records your name, mobile number and visit times for security. Your details are kept only for that purpose."}'::jsonb),
  ('alerts', '{"makeWebhookUrl":null,"whatsappEnabled":false}'::jsonb)
on conflict (key) do nothing;
