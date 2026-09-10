# Implementation Plan: Fermentation Monitor for Homebrewers/Kombucha Makers

## Hardware Recommendation: ESP32, not Raspberry Pi

Go ESP32 for the sensor node. Reasoning:

- **Cost**: ESP32 board ~$5-8 vs RPi Zero 2W ~$15-18. At scale this is your margin.
- **Power**: ESP32 sips power (deep-sleep capable, runs weeks on batteries). RPi is an always-on Linux box — overkill and power-hungry for "read a temp sensor every few minutes and push it to WiFi."
- **Form factor**: You want something small enough to float/strap onto a fermenter, not a full computer.
- **Your RPi experience still helps**: use a Pi (or just your dev machine) as the *base station/gateway* if you go LoRa later, or skip that entirely and have the ESP32 hit WiFi directly for v1 — simpler, and homebrewers overwhelmingly have home WiFi near their fermenter.

**v1 architecture**: ESP32 + DS18B20 (waterproof temp probe, ~$2) + optional float/gravity sensor later → WiFi → Supabase (REST insert) → React dashboard + alerting (email/push via n8n or Supabase Edge Functions). This is a firmware-plus-webapp build, not an OS-level embedded project — matches your stack almost exactly.

Skip gravity/density sensing in v1. Temp monitoring + alerting alone is a sellable, buildable MVP; gravity sensors (Tilt/iSpindel-style) are a v2 upsell once you have paying users telling you they want it.

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

**Margin reference**: at $99 retail (~R1,830), gross margin per unit is roughly R1,500–R2,000 before payment processing fees, shipping to customer, and assembly labor.

---

## Phase 0 (Week 1): Parallel validation kickoff

**Landing page track:**
- One-page site: problem statement ("stop losing batches to temperature swings"), how it works, pre-order email capture, target price ($99-129 device + $9/mo optional dashboard subscription — anchor near Tilt's $135 and Inkbird's $35-50). In ZAR terms (~R18.5/USD) that's roughly R1,830-R2,390 device + R165/mo — useful for your own cost tracking, but keep the storefront priced in USD since the audience is global (Reddit/forums homebrew communities).
- Post in r/Homebrewing, r/fermentation, r/Kombucha, Homebrew Talk forums. Be upfront it's not built yet — "would you use this, what would you pay" gets more honest signal than a polished fake-door.
- Track: signups, and importantly the *comments* — feature requests tell you what v2 should be.

**Prototype track (parallel, same week):**
- Order parts: ESP32 dev board, DS18B20 probe, breadboard, buck converter — under $30 total (roughly R330-R675 landed in ZAR once shipping/customs on imported electronics is factored in — treat this as your real budgeting number, not the raw FX conversion).
- Get one node reading temp and posting to a Supabase table within a few days. This isn't the product yet, just proof you can do the full pipeline.

**Gate to proceed**: 50+ email signups OR 5+ people saying "I'd pay for this now" in comments/DMs, within 3-4 weeks. If you're well short, dig into *why* before spending more — could be pricing, could be wrong community, could be feature gap (e.g. they all want gravity not temp).

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
- Order components in that batch quantity, assemble by hand.
- **Budget for this batch**: roughly R5,000-R17,000 total ZAR component spend for 15-25 units (landed cost, including shipping/customs on imported parts) — small enough to self-fund from pocket, which is the point of pre-selling before committing to inventory.
- This is your real go/no-go: **if you can't convert signups to actual paid pre-orders, the idea needs rework before you sink more time in.**

---

## Phase 3 (Ongoing): Subscription layer + iterate

- Ship devices, free dashboard access included for first period, then $7-9/mo subscription for continued cloud alerting/history (roughly R130-R165/mo — for your own P&L tracking; keep the customer-facing price in USD). Device still works locally/via app without it — don't hard-lock basic function behind subscription, or you'll get review backlash.
- Collect feature requests systematically — gravity sensing is the obvious v2, but let real users confirm before building it.

---

## Immediate Next Step

Decide whether to draft the landing page copy first, or spec out the ESP32 firmware/Supabase schema first. Either can start immediately.

## Status in this repository

This repo implements the Phase 1 MVP build:

- `firmware/` — ESP32 + DS18B20 sketch (temp read, threshold alerting, deep sleep, battery monitoring)
- `supabase/` — Postgres schema, RLS policies, and an Edge Function that emails on new alerts
- `dashboard/` — React + TypeScript dashboard (auth, per-device live reading, 48h chart, alert history, threshold editor)
- `landing/` — static one-page pre-order/signup site for the Phase 0 validation track
