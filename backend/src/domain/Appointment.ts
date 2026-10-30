import { badRequest } from "../lib/errors";
import type { AppointmentStatus } from "./types";

export interface Slot {
  id: number;
  roomId: number | null;
  startsAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  label: string;
}

export const Appointment = {
  endOf: (s: Slot) => new Date(s.startsAt.getTime() + s.durationMinutes * 60000),

  overlaps(a: Slot, b: Slot): boolean {
    return a.startsAt < Appointment.endOf(b) && b.startsAt < Appointment.endOf(a);
  },

  /** Two live bookings wanting the same room at the same time. */
  clashes(slots: Slot[]): Array<[Slot, Slot]> {
    const live = slots.filter((s) => s.status !== "Declined" && s.roomId !== null);
    const found: Array<[Slot, Slot]> = [];
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (live[i].roomId === live[j].roomId && Appointment.overlaps(live[i], live[j])) found.push([live[i], live[j]]);
      }
    }
    return found;
  },

  parseStart(date: string, time: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw badRequest("Choose a date for the appointment.");
    if (!/^\d{2}:\d{2}$/.test(time ?? "")) throw badRequest("Choose a time for the appointment.");
    // The office is in Asia/Kolkata, which never changes its clocks.
    const at = new Date(`${date}T${time}:00+05:30`);
    if (Number.isNaN(at.getTime())) throw badRequest("That date and time are not valid.");
    return at;
  }
};
