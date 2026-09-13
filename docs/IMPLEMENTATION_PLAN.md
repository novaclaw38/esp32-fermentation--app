# Implementation Plan: Fermentation Monitor for Homebrewers/Kombucha Makers

## Hardware Recommendation: ESP32, not Raspberry Pi

Go ESP32 for the sensor node. Reasoning:

- **Cost**: ESP32 board ~$5-8 vs RPi Zero 2W ~$15-18. At scale this is your margin.
- **Power**: ESP32 sips power (deep-sleep capable, runs weeks on batteries). RPi is an always-on Linux box — overkill and power-hungry for "read a temp sensor every few minutes and push it to WiFi."
- **Form factor**: You want something small enough to float/strap onto a fermenter, not a full computer.
- **Your RPi experience still helps**: use a Pi (or just your dev machine) as the *base station/gateway* if you go LoRa later, or skip that entirely and have the ESP32 hit WiFi directly for v1 — simpler, and homebrewers overwhelmingly have home WiFi near their fermenter.

**v1 architecture**: ESP32 + DS18B20 (waterproof temp probe, ~$2) → WiFi → Supabase (REST insert) → React dashboard + alerting (email/push via n8n or Supabase Edge Functions). This is a firmware-plus-webapp build, not an OS-level embedded project — matches your stack almost exactly.

The original plan said to skip gravity/density sensing in v1, and that
sequencing still holds for what you *sell first*: temp monitoring +
alerting alone is a sellable, buildable MVP, and gravity is the upsell
once paying users ask for it. What's changed since this plan was written
is that the gravity hardware and firmware now exist in this repo, so
"add gravity" is no longer an unknown-cost future project — it's a
second SKU that can be built on demand.

### Two devices, not three (the "egg")

The design settled on **two** buildable units, not one Hub plus a
bolt-on gravity accessory:

| Unit | Sensors | Where it lives |
|---|---|---|
| **Hub** | Temperature (external probe), optional humidity/pressure (BME280) | Outside the fermenter, probe in the liquid |
| **Temp + Gravity Module** (the floating "egg") | Temperature *and* gravity/density | Sealed, floating **inside** the fermenter |

The floating unit needs a temperature sensor on board regardless — the
tilt→specific-gravity curve has to be temperature-compensated — and that
reading is a perfectly good, independently-useful temperature value. So
it is posted as its own reading, and **a customer who wants both
temperature and gravity buys one device, not two**. The Hub stays the
right choice for temp-only (cheaper, no accelerometer) or when humidity
is what's wanted.

Gravity is stored as raw tilt angle and converted to SG on read, from
per-device calibration coefficients — so recalibrating a unit corrects
its entire history instead of baking wrong numbers into stored rows.

Schematic: [`hardware/schematic-gravity-module.html`](../hardware/schematic-gravity-module.html).
Design notes and per-module BOMs:
[`hardware/MULTI_SENSOR_MODULES.md`](../hardware/MULTI_SENSOR_MODULES.md).
Firmware: `firmware/fermentation_tilt_v1/`.

---

## Parts List & Cost Reference (v1)

| Component | Purpose | Cost (USD) | Cost (ZAR, landed*) |
|---|---|---|---|
| ESP32 DevKit | Main MCU + WiFi | $4–7 | R110–R195 |
| DS18B20 waterproof probe | Temp sensing | $1.50–3 | R40–R80 |
| 4.7kΩ resistor (pull-up) | 1-Wire pull-up | $0.02 | R0.50 |
| 2x 100kΩ resistor | Battery voltage divider | $0.04 | R1 |
| 18650 Li-ion cell + holder | Battery power | $2–4 | R55–R110 |
| TP4056 module (USB-C) | Battery charging | $0.50 | R15 |
| Small perfboard | Mounting | $1–3 | R25–R80 |
| Project enclosure + cable gland | Weatherproofing | $2–5 | R55–R135 |
| JST/screw terminal connector | Probe connection | $0.30 | R8 |

**Estimated BOM per unit: ~$12–25 USD → roughly R330–R675 ZAR (landed)**

*Landed cost includes a ~25% markup over raw USD/ZAR conversion for shipping and customs on imported electronics — budget against this number, not the raw FX rate.

**Margin reference**: at $55 retail (~R1,510), gross margin per unit is roughly R825–R1,180 before payment processing fees, shipping to customer, and assembly labor. (The earlier version of this line assumed $99 retail; see the competitive reality check for why that price does not hold.)

This table is the Phase 0/1 prototype BOM: an off-the-shelf DevKit, a
separate TP4056 breakout module, and hand-wired perfboard. It's what to
order for the first working node — not what to order for the Phase 2
pre-sold batch. See below for the batch-quantity numbers once a custom
PCB is in the picture.

---

## Parts List & Cost Reference (v2 — custom PCB, Phase 2 batch)

Once you're past the perfboard prototype and converting pre-orders into an
actual 15-25 unit batch, build to the custom PCB in
[`hardware/PCB_DESIGN.md`](../hardware/PCB_DESIGN.md) instead of
hand-wiring perfboard. It replaces the DevKit + standalone TP4056 module +
perfboard + loose resistors with one small board (bare ESP32-WROOM-32E
module, TP4056 IC, DW01A+FS8205 battery protection the loose TP4056 module
didn't have, a low-quiescent-current LDO, and the on-board pull-ups/divider)
— everything else (probe, cell, enclosure) is unchanged from the v1 table.

| Component | Purpose | Cost (USD) | Cost (ZAR, landed*) |
|---|---|---|---|
| Custom PCB, fab + SMT assembly (all on-board components incl. ESP32-WROOM-32E) | Replaces DevKit + TP4056 module + perfboard + loose resistors | $6–8 | R165–R220 |
| DS18B20 waterproof probe | Temp sensing (unchanged) | $1.50–3 | R40–R80 |
| 18650 Li-ion cell + holder | Battery power (unchanged) | $2–4 | R55–R110 |
| Project enclosure + cable gland | Weatherproofing (unchanged) | $2–5 | R55–R135 |

**Estimated BOM per unit: ~$11.50–20 USD → roughly R315–R550 ZAR (landed)**
— slightly *cheaper* than the v1 perfboard BOM at this quantity, mainly
because LCSC-sourced components in an SMT assembly run undercut buying a
DevKit + a separate TP4056 breakout module retail, even before counting
the assembly labor perfboard would have cost instead.

*Same ~25% landed-cost convention as the v1 table above.

**Margin reference**: at $55 retail (~R1,510), gross margin per unit is
roughly R960–R1,195 before payment processing fees, shipping to customer,
and assembly labor — a modest improvement over the v1 estimate. The Hub is
the SKU where this price is comfortable: it competes with Inkbird-class
controllers at $35–50, not with a $50 float.

---

## Parts List & Cost Reference (Temp + Gravity Module — the floating "egg")

The second SKU: one sealed floating unit that reports **both** temperature
and specific gravity. Same electrical architecture as the v2 Hub PCB
(ESP32-WROOM-32E, TP4056 charging, DW01A+FS8205 protection, low-Iq LDO,
gated battery divider — reused verbatim rather than redesigned) plus an
ADXL345 accelerometer for tilt. Full per-reference BOM in
[`hardware/MULTI_SENSOR_MODULES.md`](../hardware/MULTI_SENSOR_MODULES.md).

| Component | Purpose | Cost (USD) | Cost (ZAR, landed*) |
|---|---|---|---|
| Custom PCB, fab + SMT assembly (ESP32-WROOM-32E, TP4056, DW01A+FS8205, LDO, passives) | Same board architecture as the Hub | $6–8 | R165–R220 |
| ADXL345 accelerometer | Tilt angle → specific gravity | ~$1.80 | ~R50 |
| DS18B20 (bare, potted inside the housing) | Temperature — both the SG compensation *and* the customer-facing reading | $1–2 | R28–R55 |
| 18650 Li-ion cell (~2500mAh) | Battery power — the 37mm housing fits one, giving ~5 months per charge instead of ~3 weeks | $2–4 | R55–R110 |
| Sealed floating housing, ~37mm × 125mm (tube + top cap) | Flotation + waterproofing | $3–7 | R80–R195 |

**Estimated BOM per unit: ~$13–25 USD → roughly R360–R690 ZAR (landed)**
— itemised in full, including ballast, potting, gasket and desiccant, in
[`hardware/BOM_TEMP_GRAVITY.md`](../hardware/BOM_TEMP_GRAVITY.md)

**Housing diameter is the decision that matters most here.** An earlier
revision assumed a 25–32mm test-tube vial, which forces a ~350mAh cell and
about three weeks of battery life. Specifying ~37mm (matching KegLand's RAPT
Pill at 37 × 125mm) fits an 18650 and takes that to an estimated ~5 months at
the firmware's 15-minute interval — the difference between charging between
every batch and charging twice a year, for a few cents of extra plastic.
— the electronics come to ~$6–8/unit, essentially the same as the Hub;
the ADXL345 adds under $2 and the DS18B20 gets *cheaper* because it's a
bare potted sensor rather than a waterproof cabled probe with a sealed
connector.

*Same ~25% landed-cost convention as the tables above.

**The housing is the real cost risk, not the electronics.** A 3D-printed
or repurposed-vial body needs its own waterproofing validation, and a
leak here kills the unit *and* the batch it was floating in. This is
exactly the "most likely to eat unexpected time" item this plan flagged
for the Hub enclosure, except with a harder requirement — fully
submerged, not just splash-resistant. Budget schedule for it, and price
the SKU above the Hub accordingly (Tilt Hydrometer sits at ~$135 for
gravity alone).

**Still unvalidated on hardware**: the tilt axis assumption in firmware
(which physical axis runs along the housing) and the calibration
polynomial both need a real unit in real liquid before any batch order.

---

## Competitive reality check (added after the fact — read before pricing)

This plan originally anchored pricing against the Tilt Hydrometer alone. That
was an incomplete picture and produced a target price the market will not
support. Checked September 2026:

| | Tilt | Tilt Pro | RAPT Pill (KegLand) | This design |
|---|---|---|---|---|
| Price | $135 | $175 (Pro Mini) | ~$48–54 | — |
| Radio | Bluetooth LE | BLE | WiFi **+** BLE | WiFi only |
| Battery | CR123A primary | 2×AA lithium | 18650 rechargeable | 18650 rechargeable |
| Life | 12–24 months | 3–5 years | "months" | ~5 months (estimated) |
| Gravity accuracy | ±0.002 SG | ±0.002 | ±0.002 | **unknown** |
| Pressure rating | — | — | 0–5 bar | **none** |
| Backend | phone / Tilt Pi | same | RAPT cloud | **your own Supabase** |
| Shipping today | yes | yes | yes | **no** |

Sources: [tilthydrometer.com](https://tilthydrometer.com/),
[Tilt review/specs](https://www.homebrewfinds.com/tilt-hydrometer-review/),
[RAPT Pill](https://kegland.com.au/products/green-rapt-pill-hydrometer-thermometer-wifi-bluetooth).

**The $99–129 target was wrong.** RAPT sells at roughly half that and does
more: both radios, pressure-rated to 5 bar, an optional wireless-charging
variant, and years of field-proven firmware. Asking $99 for an unbuilt product
against a $50 incumbent is not a pricing question, it is a non-starter.

**Three honest consequences:**

1. **The float SKU is not a standalone business at this scale.** BOM is
   $13–25/unit. To undercut RAPT you would price near $45–55, leaving
   $20–40 before shipping, payment fees, and your own assembly time. For a
   hand-assembled batch that is close to break-even — a cost-recovering
   hobby product, not a margin business. Decide deliberately whether that is
   acceptable rather than discovering it after ordering 25 housings.
2. **The Hub is the better commercial bet.** It competes against Inkbird-class
   temperature controllers at $35–50, not against a $50 float that took a
   manufacturer years to refine, and its BOM is $11.50–20. Same backend, same
   dashboard, far less to get wrong.
3. **The defensible difference is software and ownership, not hardware.** You
   will not out-manufacture KegLand on an injection-moulded pressure-rated
   float. What this build has that neither competitor offers: gravity computed
   on read so recalibration retroactively fixes history, temperature
   correction measured from a recorded calibration temperature, and a backend
   the customer owns and can self-host rather than a vendor cloud. If there is
   a business here, that is where it lives.

**Also worth knowing before promising anything:** Tilt publishes 300 ft range
in water but **20 ft in a 5-gallon stainless keg**. WiFi/BLE at 2.4 GHz does
not pass through a steel wall at all (skin depth ~8.6 µm; a 1.2 mm wall is
~1200 dB), so in-vessel hydrometers depend entirely on the vessel's apertures
and gasket seams. Sealed stainless conicals are effectively out of reach for
this whole product class, ours included. Say so up front rather than in
support tickets.

---

## Phase 0 (Week 1): Parallel validation kickoff

**Landing page track:**
- One-page site: problem statement ("stop losing batches to temperature swings"), how it works, pre-order email capture, target price — **see the competitive reality check above before setting this.** The original $99-129 anchor was based on Tilt's $135 alone and does not survive contact with RAPT at ~$50. Realistic options are to price the float at $45-55 (roughly cost recovery at this batch size), or to lead with the Hub at $45-65 against Inkbird-class controllers at $35-50. Keep the storefront priced in USD since the audience is global (Reddit/forums homebrew communities); track your own costs in ZAR.
- Post in r/Homebrewing, r/fermentation, r/Kombucha, Homebrew Talk forums. Be upfront it's not built yet — "would you use this, what would you pay" gets more honest signal than a polished fake-door.
- Track: signups, and importantly the *comments* — feature requests tell you what v2 should be.

**Prototype track (parallel, same week):**
- Order parts: ESP32 dev board, DS18B20 probe, breadboard, buck converter — under $30 total (roughly R330-R675 landed in ZAR once shipping/customs on imported electronics is factored in — treat this as your real budgeting number, not the raw FX conversion).
- Get one node reading temp and posting to a Supabase table within a few days. This isn't the product yet, just proof you can do the full pipeline.

**Gate to proceed**: 50+ email signups OR 5+ people saying "I'd pay for this now" in comments/DMs, within 3-4 weeks. If you're well short, dig into *why* before spending more — could be pricing, could be wrong community, could be feature gap. If the feedback is "gravity, not temp," that's no
  longer a pivot — lead with the floating Temp + Gravity unit instead of
  the Hub; the hardware and firmware for it are already in this repo.

---

## Phase 1 (Weeks 2-5, overlapping Phase 0): MVP build

1. **Firmware**: ESP32 reads DS18B20 every 5-15 min, posts to Supabase via HTTPS, deep-sleeps between reads. Add OTA update capability early — you will need to push firmware fixes to field units.
2. **Backend**: Supabase table per device, RLS scoped per user account, threshold-based alert rules.
3. **Alerting**: Start dumb and reliable — email via Supabase Edge Function or n8n webhook when temp exceeds a user-set range for N consecutive readings (avoid false-alarm spam from single blips).
4. **Dashboard**: React, one page per device — current temp, 24-48h graph, alert history. Don't build multi-batch history/analytics yet; that's a retention feature for later, not an MVP requirement.
5. **Enclosure**: 3D-printed or off-the-shelf project box, sealed connector for the probe. This is the part most likely to eat unexpected time — budget for it.

---

## Phase 2 (Week 5-6): Small pre-sold batch

- Take the signups from Phase 0 and convert 15-25 into actual pre-orders (payment upfront via PayFast/Stripe — don't build inventory speculatively).
- Order the custom PCB (see `hardware/PCB_DESIGN.md`) in batch quantity, have it SMT-assembled rather than hand-wiring perfboard at this volume.
- **Budget for this batch**: roughly R4,700-R13,750 total ZAR component+PCB spend for 15-25 units (landed cost, using the v2 PCB BOM above) — small enough to self-fund from pocket, which is the point of pre-selling before committing to inventory. (The earlier perfboard-based estimate was R5,000-R17,000; the PCB path is slightly cheaper at this quantity once assembly is factored in.)
- If pre-orders skew toward gravity, the floating Temp + Gravity unit is
  the batch to build instead of (or alongside) the Hub: ~R360-R690/unit
  landed, so 15-25 units is roughly R5,400-R17,250 — the same order of
  magnitude as the Hub batch. Order housings first and leak-test them
  before committing to a PCB run; the board is proven architecture, the
  housing is not.
- This is your real go/no-go: **if you can't convert signups to actual paid pre-orders, the idea needs rework before you sink more time in.**

---

## Phase 3 (Ongoing): Subscription layer + iterate

- Ship devices, free dashboard access included for first period, then $7-9/mo subscription for continued cloud alerting/history (roughly R130-R165/mo — for your own P&L tracking; keep the customer-facing price in USD). Device still works locally/via app without it — don't hard-lock basic function behind subscription, or you'll get review backlash.
- Collect feature requests systematically. Gravity sensing was the obvious
  v2 and is now **built** (floating Temp + Gravity unit — schematic,
  firmware, and schema all in this repo), so the question is no longer
  "should we build it" but "is there enough demand to order housings and
  a second PCB run." Let real pre-orders answer that. CO₂ safety monitoring
  is the next module in the same state (schematic done, firmware not yet).

---

## Immediate Next Step

Decide whether to draft the landing page copy first, or spec out the ESP32 firmware/Supabase schema first. Either can start immediately.

## Status in this repository

This repo implements the Phase 1 MVP build:

- `firmware/` — two ESP32 sketches: the **Hub**
  (`fermentation_monitor_v1/` — DS18B20 temp read, threshold alerting,
  deep sleep, battery monitoring) and the floating **Temp + Gravity
  Module** (`fermentation_tilt_v1/` — potted DS18B20 + ADXL345 tilt,
  posting temperature and raw tilt angle)
- `supabase/` — Postgres schema, RLS policies, and an Edge Function that emails on new alerts
- `dashboard/` — React + TypeScript dashboard (auth, per-device live reading, 48h chart, alert history, threshold editor)
- `landing/` — static one-page pre-order/signup site for the Phase 0 validation track
- `hardware/` — custom PCB design (schematic, BOM, DFM notes) for the
  Phase 2 pre-sold batch, replacing the perfboard build above, plus the
  sensor-module line: the BME280 humidity add-on, the floating **Temp +
  Gravity Module**, and the CO₂ Safety Module
  (`MULTI_SENSOR_MODULES.md` + one schematic per module)

Beyond the original Phase 1 scope, the backend and schematics now also
cover the floating Temp + Gravity unit: `readings.tilt_deg`,
`devices.device_type`, per-device calibration coefficients, and a
`readings_with_gravity` view that computes SG on read
(`supabase/migrations/20260912100000_tilt_gravity_support.sql`).

The dashboard charts gravity for `tilt` devices and takes each unit's
calibration curve and calibration temperature, and gravity is corrected to a
20 °C reference using the standard hydrometer curve — so the floating module
is complete end to end in software, including the temperature compensation
the onboard DS18B20 exists for. What's untested is physical: the tilt axis assumption and the
housing's waterproofing.

Not yet built: CO₂ module firmware and its schema/dashboard support.
