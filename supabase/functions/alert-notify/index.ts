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
//      Optionally DASHBOARD_URL (e.g. https://app.example.com) so the email
//      links straight to the device.
//   3. The alerts-insert trigger calls this function. Store the same secret
//      and this function's URL in Vault (see supabase/README.md).
//
// WEBHOOK_SECRET is required: with it unset every request is refused. The
// previous behaviour (skip the check when unset) turned a missed setup step
// into an open relay that would email any device's owner on request.
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
const DASHBOARD_URL = Deno.env.get("DASHBOARD_URL")?.replace(/\/$/, "");

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

function formatTemp(tempC: number): string {
  return `${tempC.toFixed(1)}°C (${((tempC * 9) / 5 + 32).toFixed(1)}°F)`;
}

function reasonToText(reason: string, tempC: number | null): string {
  if (reason === "below_min" && tempC != null) return `dropped to ${formatTemp(tempC)}, below your minimum threshold`;
  if (reason === "above_max" && tempC != null) return `rose to ${formatTemp(tempC)}, above your maximum threshold`;
  if (reason === "battery_low") return "is reporting a low battery";
  if (reason === "sensor_fault") return "failed to get a temperature reading -- check the sensor's wiring";
  return `reported a problem${tempC != null ? ` at ${formatTemp(tempC)}` : ""} (${reason})`;
}

// Subject names the actual problem -- "out of range" was wrong for a low
// battery or a dead sensor, which are exactly the alerts easiest to ignore.
function subjectFor(reason: string, deviceName: string): string {
  switch (reason) {
    case "below_min":
      return `${deviceName} is too cold`;
    case "above_max":
      return `${deviceName} is too warm`;
    case "battery_low":
      return `${deviceName} battery is low`;
    case "sensor_fault":
      return `${deviceName} sensor stopped reading`;
    default:
      return `${deviceName} needs attention`;
  }
}

function formatTime(iso: string): string {
  // No per-user time zone on file, so say plainly which zone this is rather
  // than printing a raw ISO string.
  return new Date(iso).toUTCString().replace("GMT", "UTC");
}

// Constant-time so the comparison can't be timed byte by byte.
function secretsMatch(provided: string | null, expected: string): boolean {
  if (provided == null) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sendEmail(to: string, deviceName: string, deviceId: string, alert: AlertRow) {
  const tempC = alert.temperature_c != null ? Number(alert.temperature_c) : null;
  const what = reasonToText(alert.reason, tempC);

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set -- skipping email send, logging only");
    console.log(`[alert-notify] would email ${to}: ${deviceName} (${deviceId}) ${what}`);
    return;
  }

  const link = DASHBOARD_URL ? `${DASHBOARD_URL}/devices/${encodeURIComponent(deviceId)}` : null;
  const body = [
    `Your fermentation monitor "${deviceName}" (${deviceId}) ${what}.`,
    "",
    `Time: ${formatTime(alert.created_at)}`,
    "",
    link ? `See the history and acknowledge it: ${link}` : "Open the dashboard to see the history and acknowledge it.",
    "",
    "You're getting this because email alerts are on for this device. Turn them off under Settings > Data.",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      to: [to],
      subject: subjectFor(alert.reason, deviceName),
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

  // Fail closed: an unconfigured secret refuses everything rather than
  // accepting everything.
  if (!WEBHOOK_SECRET) {
    console.error("alert-notify: WEBHOOK_SECRET is not set -- refusing all requests");
    return new Response("not configured", { status: 500 });
  }
  if (!secretsMatch(req.headers.get("x-webhook-secret"), WEBHOOK_SECRET)) {
    return new Response("unauthorized", { status: 401 });
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Re-read the alert rather than trusting the posted body: the payload only
  // names which alert, the database says what it is.
  const alertId = Number(payload.record?.id);
  if (!Number.isInteger(alertId)) {
    return new Response("missing alert id", { status: 400 });
  }
  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .select("id, device_id, temperature_c, reason, created_at")
    .eq("id", alertId)
    .single<AlertRow>();
  if (alertError || !alert) {
    console.error("alert-notify: alert lookup failed", alertError);
    return new Response("alert not found", { status: 404 });
  }

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
