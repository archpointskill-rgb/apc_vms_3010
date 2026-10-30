import type { VisitorType } from "./types";

export interface Rule {
  id: number;
  priority: number;
  hostId: number | null;       // null = any host
  visitorTypes: VisitorType[] | null; // null = any type
  roomId: number;
  active: boolean;
}

/**
 * Where a visitor should be taken. The first matching rule wins; if none match,
 * the host's own cabin is used. Reception can always override for one visit.
 *
 * The same logic lives in the database as public.suggest_room(), so a direct
 * database insert lands in the same room.
 */
export function suggestRoom(
  rules: Rule[],
  hostId: number | null,
  visitorType: VisitorType,
  hostDefaultRoomId: number | null
): number | null {
  const match = [...rules]
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority)
    .find((r) => (r.hostId === null || r.hostId === hostId) && (r.visitorTypes === null || r.visitorTypes.includes(visitorType)));
  return match ? match.roomId : hostDefaultRoomId;
}
