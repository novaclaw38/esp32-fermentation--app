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
  temperature_c: number;
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

function reasonToText(reason: string, tempC: number): string {
  if (reason === "below_min") return `dropped to ${tempC.toFixed(1)}°C, below your minimum threshold`;
  if (reason === "above_max") return `rose to ${tempC.toFixed(1)}°C, above your maximum threshold`;
  return `reported an out-of-range reading of ${tempC.toFixed(1)}°C (${reason})`;
}

async function sendEmail(to: string, deviceName: string, deviceId: string, alert: AlertRow) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set -- skipping email send, logging only");
    console.log(`[alert-notify] would email ${to}: ${deviceName} (${deviceId}) ${reasonToText(alert.reason, Number(alert.temperature_c))}`);
    return;
  }

  const subject = `Fermentation alert: ${deviceName} out of range`;
  const body = `Your fermentation monitor "${deviceName}" (${deviceId}) ${reasonToText(alert.reason, Number(alert.temperature_c))}.\n\nTime: ${alert.created_at}\n\nOpen the dashboard to view the full temperature history and adjust thresholds.`;

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
    .select("id, name, user_id")
    .eq("id", alert.device_id)
    .single();

  if (deviceError || !device) {
    console.error("alert-notify: device lookup failed", deviceError);
    return new Response("device not found", { status: 404 });
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
