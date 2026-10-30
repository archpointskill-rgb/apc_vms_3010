import type { Conn } from "../db";
import { one, query } from "../db";
import type { Rule } from "../domain/LocationRule";
import { suggestRoom } from "../domain/LocationRule";
import type { Floor, VisitorType } from "../domain/types";

export interface HostRow {
  id: number; name: string; designation: string | null; department: string | null;
  floor: Floor; defaultRoomId: number | null; defaultRoomName: string | null;
  mobile: string | null; email: string | null; active: boolean;
}

export const listHosts = (c: Conn, includeInactive = false) =>
  query<HostRow>(
    c,
    `select h.id, h.name, h.designation, h.department, h.floor,
            h.default_room_id as "defaultRoomId", r.name as "defaultRoomName",
            h.mobile, h.email, h.active
       from public.hosts h left join public.rooms r on r.id = h.default_room_id
      where $1 or h.active
      order by h.name`,
    [includeInactive]
  );

export const listRooms = (c: Conn, includeInactive = false) =>
  query<{ id: number; name: string; floor: Floor; active: boolean }>(
    c,
    `select id, name, floor, active from public.rooms
      where $1 or active order by floor, name`,
    [includeInactive]
  );

export const listRules = async (c: Conn): Promise<Rule[]> =>
  (await query<any>(c, `select id, priority, host_id, visitor_types, room_id, active
                          from public.location_rules order by priority`)).map((r) => ({
    id: r.id,
    priority: r.priority,
    hostId: r.host_id,
    visitorTypes: r.visitor_types as VisitorType[] | null,
    roomId: r.room_id,
    active: r.active
  }));

/**
 * Which room a visitor should be taken to. The same rules exist in the database
 * as public.suggest_room(); this reads them so the answer can be shown on the
 * check-in form before anything is saved.
 */
export async function suggestRoomFor(c: Conn, hostId: number | null, visitorType: VisitorType) {
  const rules = await listRules(c);
  const host = hostId ? await one<{ default_room_id: number | null }>(c, "select default_room_id from public.hosts where id = $1", [hostId]) : null;
  const roomId = suggestRoom(rules, hostId, visitorType, host?.default_room_id ?? null);
  if (!roomId) return null;
  return one<{ id: number; name: string; floor: Floor }>(c, "select id, name, floor from public.rooms where id = $1", [roomId]);
}

export const getSetting = async <T,>(c: Conn, key: string): Promise<T | null> =>
  (await one<{ value: T }>(c, "select value from public.settings where key = $1", [key]))?.value ?? null;

export const putSetting = (c: Conn, key: string, value: unknown) =>
  query(c, `insert into public.settings (key, value, updated_at) values ($1, $2::jsonb, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
