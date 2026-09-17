// alert-notify
// ------------
// Triggered by a Supabase Database Webhook on `insert` into `alerts`.
// Looks up the device owner's email and sends a threshold-breach
// notification via Resend (https://resend.com).
//
// Setup:
//   1. Deploy: supabase functions deploy alert-notify
//   2. Set secrets:
//        supabase secrets set RESEND_API_KEY=... \
//                              ALERT_FROM_EMAIL="alerts@yourdomain.com" \
//                              WEBHOOK_SECRET=$(openssl rand -hex 32)
//      (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already injected
//      automatically into every Edge Function.)
//   3. In the Supabase dashboard: Database > Webhooks > Create a new hook
//        - Table: alerts, Event: Insert
//        - Type: HTTP Request -> Edge Function -> alert-notify
//        - Add header: x-webhook-secret: <same value as WEBHOOK_SECRET>
//
// This function intentionally does its own header-secret check because
// verify_jwt is disabled for it (see supabase/config.toml) -- database
// webhooks don't carry a user JWT, only whatever headers you configure.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ALERT_FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") ?? "alerts@fermentation-monitor.local";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

interface AlertRow {
  id: number;
  device_id: string;
  /** Null for a reason with no reading behind it, e.g. sensor_fault. */
  temperature_c: number | null;
  reason: string;
  created_at: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: AlertRow;
  schema: string;
  old_record: AlertRow | null;
}

function reasonToText(reason: string, tempC: number | null): string {
  if (reason === "below_min" && tempC != null) return `dropped to ${tempC.toFixed(1)}°C, below your minimum threshold`;
  if (reason === "above_max" && tempC != null) return `rose to ${tempC.toFixed(1)}°C, above your maximum threshold`;
  if (reason === "battery_low") return "is reporting a low battery";
  if (reason === "sensor_fault") return "failed to get a temperature reading -- check the sensor's wiring";
  return `reported an out-of-range reading${tempC != null ? ` of ${tempC.toFixed(1)}°C` : ""} (${reason})`;
}

async function sendEmail(to: string, deviceName: string, deviceId: string, alert: AlertRow) {
  const tempC = alert.temperature_c != null ? Number(alert.temperature_c) : null;

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set -- skipping email send, logging only");
    console.log(`[alert-notify] would email ${to}: ${deviceName} (${deviceId}) ${reasonToText(alert.reason, tempC)}`);
    return;
  }

  const subject = `Fermentation alert: ${deviceName} out of range`;
  const body = `Your fermentation monitor "${deviceName}" (${deviceId}) ${reasonToText(alert.reason, tempC)}.\n\nTime: ${alert.created_at}\n\nOpen the dashboard to view the full temperature history and adjust thresholds.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      to: [to],
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${errText}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  if (payload.table !== "alerts" || payload.type !== "INSERT") {
    return new Response("ignored (not an alert insert)", { status: 200 });
  }

  const alert = payload.record;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("id, name, user_id, notify_email")
    .eq("id", alert.device_id)
    .single();

  if (deviceError || !device) {
    console.error("alert-notify: device lookup failed", deviceError);
    return new Response("device not found", { status: 404 });
  }

  // Separate from alerts_muted_until, which silences the alert itself
  // (dashboard included). This only silences email for an alert the owner
  // still wants to see on the dashboard.
  if (device.notify_email === false) {
    console.log(`[alert-notify] notify_email is false for ${device.id} -- skipping email`);
    return new Response("email disabled for this device", { status: 200 });
  }

  const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(device.user_id);
  if (userError || !userResult?.user?.email) {
    console.error("alert-notify: user lookup failed", userError);
    return new Response("device owner not found", { status: 404 });
  }

  try {
    await sendEmail(userResult.user.email, device.name, device.id, alert);
  } catch (err) {
    console.error("alert-notify: send failed", err);
    return new Response("email send failed", { status: 502 });
  }

  return new Response("ok", { status: 200 });
});
