#!/usr/bin/env node
/**
 * Factory provisioning for Fermentation Monitor units.
 *
 * Calls provision_device() once per unit with the service_role key and writes
 * everything a build session needs:
 *
 *   manifest.csv      the master record -- CONTAINS DEVICE SECRETS
 *   firmware/<id>.txt the CONFIG lines to paste into the sketch for that unit
 *   labels.html       a printable sheet of claim codes to stick on the units
 *
 * Zero dependencies: Node 18+ only.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node tools/provision.mjs --count 20 --type tilt
 *
 * Add --dry-run to exercise the output without touching the database.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const out = { count: 1, type: "tilt", name: "Fermentation Monitor", dryRun: false, outDir: "provisioning" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--count") out.count = Number(argv[++i]);
    else if (a === "--type") out.type = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--out") out.outDir = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

const USAGE = `
Factory provisioning for Fermentation Monitor units.

  node tools/provision.mjs --count 20 --type tilt

  --count N     units to provision (default 1)
  --type T      hub | tilt | co2 (default tilt)
  --name "..."  default display name on the device row
  --out DIR     output directory (default ./provisioning)
  --dry-run     generate the output files without calling the database

Environment:
  SUPABASE_URL                 https://<project>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    service_role key -- NOT the anon key
`;

// ------------------------------------------------------------------- guards

/**
 * A service_role key and an anon key look identical at a glance, and pasting
 * the anon one gives a permission error deep in the run, after some units may
 * already exist. Decoding the JWT's role claim catches it before any writes.
 */
function assertServiceRoleKey(key) {
  const part = key.split(".")[1];
  if (!part) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not a JWT.");
  let role;
  try {
    role = JSON.parse(Buffer.from(part, "base64url").toString()).role;
  } catch {
    throw new Error("Could not decode SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (role !== "service_role") {
    throw new Error(
      `That key's role is "${role}", not "service_role". ` +
      `provision_device is deliberately denied to anon and authenticated, so this would fail.`,
    );
  }
}

// ---------------------------------------------------------------------- rpc

async function provisionOne({ url, key, type, name }) {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/provision_device`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ p_device_type: type, p_name: name }),
  });
  if (!res.ok) {
    throw new Error(`provision_device failed: HTTP ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.device_id || !row?.device_secret || !row?.claim_code) {
    throw new Error(`Unexpected response shape: ${JSON.stringify(rows)}`);
  }
  return row;
}

// Shaped like the real thing so --dry-run exercises every downstream path.
function fakeOne() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  const code = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * 30)]).join("");
  return {
    device_id: "ferm-" + randomUUID().replace(/-/g, "").slice(0, 10),
    device_secret: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
    claim_code: code,
  };
}

// ------------------------------------------------------------------- output

const pretty = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function firmwareSnippet(u, type) {
  return `// ${u.device_id}  --  provisioned ${u.provisioned_at}
// Paste into the CONFIG section of firmware/fermentation_${type === "tilt" ? "tilt" : "monitor"}_v1.
// WiFi is NOT set here: the unit asks its owner for that through the setup portal.

const char* DEVICE_ID     = "${u.device_id}";
const char* DEVICE_SECRET = "${u.device_secret}";

// Claim code printed on this unit: ${pretty(u.claim_code)}
// The customer types that into the dashboard. Never print the secret above.
`;
}

function labelsHtml(units, type) {
  const cards = units.map((u) => `
    <div class="label">
      <div class="brand">Fermentation Monitor</div>
      <div class="code">${pretty(u.claim_code)}</div>
      <div class="hint">Enter this code in your dashboard to add this device</div>
      <div class="id">${u.device_id} &middot; ${type}</div>
    </div>`).join("");

  return `<!doctype html><meta charset="utf-8">
<title>Claim code labels</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: system-ui, sans-serif; margin: 0; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .label {
    border: 1px dashed #999; border-radius: 3mm; padding: 5mm 4mm;
    text-align: center; break-inside: avoid; page-break-inside: avoid;
  }
  .brand { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #666; }
  .code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 19pt; font-weight: 700; letter-spacing: .06em; margin: 2mm 0 1mm;
  }
  .hint { font-size: 7.5pt; color: #444; line-height: 1.3; }
  .id { font-family: ui-monospace, monospace; font-size: 6.5pt; color: #999; margin-top: 3mm; }
  .note { font-size: 9pt; color: #555; margin: 0 0 4mm; }
  @media print { .note { display: none; } }
</style>
<p class="note">${units.length} label(s). Print, cut on the dashed lines, and stick one on each
unit. These carry only claim codes &mdash; no device secrets &mdash; so they are safe to print
and handle.</p>
<div class="sheet">${cards}</div>
`;
}

// --------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return; }

  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 500) {
    throw new Error("--count must be a whole number between 1 and 500.");
  }
  if (!["hub", "tilt", "co2"].includes(args.type)) {
    throw new Error(`--type must be hub, tilt or co2 (got "${args.type}").`);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!args.dryRun) {
    if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. (Or use --dry-run.)");
    assertServiceRoleKey(key);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(args.outDir, `batch-${stamp}${args.dryRun ? "-dryrun" : ""}`);
  mkdirSync(join(dir, "firmware"), { recursive: true });

  const units = [];
  for (let i = 0; i < args.count; i++) {
    let row;
    try {
      row = args.dryRun ? fakeOne() : await provisionOne({ url, key, type: args.type, name: args.name });
    } catch (err) {
      // Units already created are real and must not be silently orphaned:
      // write what succeeded before surfacing the failure.
      console.error(`\nFailed on unit ${i + 1} of ${args.count}: ${err.message}`);
      if (units.length) {
        writeOutputs(dir, units, args);
        console.error(`The ${units.length} unit(s) provisioned before the failure ARE in the database.`);
        console.error(`Their details were written to ${dir} -- do not re-run blindly, or you will provision duplicates.`);
      }
      process.exitCode = 1;
      return;
    }
    row.provisioned_at = new Date().toISOString();
    units.push(row);
    process.stdout.write(`\r  provisioned ${i + 1}/${args.count}`);
  }
  process.stdout.write("\n");

  writeOutputs(dir, units, args);

  console.log(`\n  ${units.length} unit(s) -> ${dir}`);
  console.log(`    manifest.csv       master record  ** CONTAINS DEVICE SECRETS **`);
  console.log(`    firmware/*.txt     per-unit CONFIG lines to paste before flashing`);
  console.log(`    labels.html        printable claim codes (no secrets; safe to print)`);
  if (args.dryRun) console.log(`\n  DRY RUN -- nothing was written to the database.`);
  else console.log(`\n  Keep manifest.csv out of version control and off shared drives.`);
}

function writeOutputs(dir, units, args) {
  const header = "device_id,device_secret,claim_code,device_type,provisioned_at\n";
  const rows = units.map((u) =>
    [u.device_id, u.device_secret, pretty(u.claim_code), args.type, u.provisioned_at]
      .map(csvCell).join(","),
  ).join("\n");
  writeFileSync(join(dir, "manifest.csv"), header + rows + "\n");

  for (const u of units) {
    writeFileSync(join(dir, "firmware", `${u.device_id}.txt`), firmwareSnippet(u, args.type));
  }
  writeFileSync(join(dir, "labels.html"), labelsHtml(units, args.type));
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exitCode = 1;
});
