import type { Conn } from "../db";
import { one, query } from "../db";
import type { Role } from "../domain/types";

const SELECT = `select s.id, s.full_name as "fullName", s.email, s.role,
                       s.host_id as "hostId", h.name as "hostName", s.active, s.created_at as "createdAt"
                  from public.staff s left join public.hosts h on h.id = s.host_id`;

export interface StaffRow {
  id: string; fullName: string; email: string; role: Role;
  hostId: number | null; hostName: string | null; active: boolean; createdAt: Date;
}

export const listStaff = (c: Conn) => query<StaffRow>(c, `${SELECT} order by s.active desc, s.full_name`);
export const getStaff = (c: Conn, id: string) => one<StaffRow>(c, `${SELECT} where s.id = $1`, [id]);

export const updateStaff = (c: Conn, id: string, patch: { role?: Role; hostId?: number | null; active?: boolean; fullName?: string }) =>
  query(
    c,
    `update public.staff
        set role = coalesce($2, role),
            host_id = case when $3::boolean then $4::bigint else host_id end,
            active = coalesce($5, active),
            full_name = coalesce($6, full_name)
      where id = $1`,
    [id, patch.role ?? null, patch.hostId !== undefined, patch.hostId ?? null, patch.active ?? null, patch.fullName ?? null]
  );
