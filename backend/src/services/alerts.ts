import { config } from "../config";
import { getSetting } from "../repositories/masters";
import type { Conn } from "../db";

export interface HostAlert {
  event: "visitor.waiting" | "visitor.reminder";
  visitId: number;
  visitorName: string;
  visitorMobile: string;
  organisation: string | null;
  visitorType: string;
  purpose: string;
  hostName: string | null;
  hostMobile: string | null;
  room: string | null;
  floor: string | null;
  checkInAt: string;
}

interface AlertSettings { makeWebhookUrl: string | null; whatsappEnabled: boolean }

/**
 * Hands the alert to a Make.com scenario, which sends the WhatsApp message from
 * the EKASA number. Reception must never wait for it and must never see it fail:
 * the in-app alert is the one that has to work, this is the extra.
 */
export async function sendHostAlert(c: Conn, alert: HostAlert): Promise<void> {
  let url = config.make.webhookUrl;
  try {
    const stored = await getSetting<AlertSettings>(c, "alerts");
    if (stored?.makeWebhookUrl) url = stored.makeWebhookUrl;
    if (stored && stored.whatsappEnabled === false && !config.make.webhookUrl) return;
  } catch {
    /* settings are optional; fall back to the environment */
  }
  if (!url || !alert.hostMobile) return;

  void deliver(url, alert);
}

async function deliver(url: string, alert: HostAlert): Promise<void> {
  const stop = AbortSignal.timeout(5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.make.secret ? { "X-ArchPoint-Secret": config.make.secret } : {})
      },
      body: JSON.stringify(alert),
      signal: stop
    });
    if (!res.ok) console.warn(`[alerts] Make.com answered ${res.status} for visit ${alert.visitId}`);
  } catch (e) {
    console.warn(`[alerts] could not reach Make.com for visit ${alert.visitId}:`, (e as Error).message);
  }
}
