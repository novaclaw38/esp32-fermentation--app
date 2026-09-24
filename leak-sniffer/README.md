# Leak Sniffer — tracer-gas water leak detection

A handheld hydrogen sniffer for locating leaks in buried or in-slab water
pipes, with a live readout and survey log in the dashboard's **Sniffer** page
(`/sniffer`).

```
 forming gas cylinder          sniffer (this board)                 phone / laptop
 5% H2 / 95% N2                                                    
   │ regulator                 probe bell ─tube─► sensor chamber   Chrome (Web Bluetooth)
   ▼                                              │  TGS2616 H2    ┌──────────────────────┐
 drained pipe ── leak ── H2 rises through ──►  pump pulls air     │ /sniffer             │
                          soil / slab            ESP32-S3 ──BLE──►│ gauge, trace, clicks │
                                                                   │ mark points + GPS    │
                                                                   └─────────┬────────────┘
                                                                             │ HTTPS
                                                                        Supabase
                                                                  leak_surveys / _points
```

| Path | What it is |
|---|---|
| [`circuits/leak_sniffer/`](circuits/leak_sniffer/) | SKiDL schematic, six blocks. ERC: 0 errors, 0 warnings |
| [`firmware/leak_sniffer_v1/`](firmware/leak_sniffer_v1/) | ESP32-S3 Arduino sketch. BLE streaming, buzzer, zero/mark button |
| [`../dashboard/src/pages/Sniffer.tsx`](../dashboard/src/pages/Sniffer.tsx) | Web app page: connect, live gauge + trace, audio, survey log, demo mode |
| [`../dashboard/src/lib/sniffer.ts`](../dashboard/src/lib/sniffer.ts) | BLE protocol + signal logic (unit tested) |
| [`../supabase/migrations/20260924120000_leak_surveys.sql`](../supabase/migrations/20260924120000_leak_surveys.sql) | `leak_surveys` + `leak_survey_points`, owner-only RLS |

## How the method works

1. Isolate the suspect pipe run and drain it (or drain as much as practical).
2. Feed **forming gas** (5% hydrogen / 95% nitrogen) in through a regulator
   at a modest pressure within the pipe's rating. Forming gas is sold as a
   standard welding/leak-test gas. At 5% hydrogen it's classed non-flammable:
   the mix has too little hydrogen and no oxygen.
3. Hydrogen is the smallest molecule there is. It escapes at the leak and
   works up through soil, screed and concrete within minutes to an hour,
   depending on depth and ground.
4. Sweep the sniffer's probe slowly along the pipe route, close to the
   surface. The reading rises as you approach the leak and **peaks directly
   above it**. On hard surfaces, drilled bar holes or joints/cracks give the
   gas a path; sample there.
5. Mark points as you go (on-screen button or the sniffer's button). Each
   point stores the response and the phone's GPS position. The highest one is
   flagged **Peak — dig here first**.

The reading is a **relative response**, `R0/Rs`: 1.00× is clean air at the
last zero, and it climbs toward the leak. Pinpointing only needs to find the
peak, and a metal-oxide sensor's absolute calibration drifts with humidity
and age, so the app doesn't pretend to measure ppm. The sniffer reports ppm
only after it's been calibrated against a 100 ppm reference gas (CONTROL
opcode `0x04`).

## Sensor choice

**Figaro TGS2616-C01**: a metal-oxide hydrogen sensor in a TO-5 can.
Datasheet (Figaro product information, rev 07/23): hydrogen-selective (low
response to CO, methane, CO₂ and acetylene), 30–3000 ppm typical range,
heater 5.0 ±0.2 V / 56 mA / 280 mW, R_L ≥ 0.45 kΩ, sensor power ≤ 15 mW.
Pins 1 and 4 are the heater, 2 is sensor (−), 3 is sensor (+).

Alternatives I rejected:

- **MQ-8 modules**: cheap, but a much less selective hydrogen element and
  loose part-to-part consistency. Too many false peaks from other gases.
- **Helium tracer** needs a thermal-conductivity sensor, and helium is far
  dearer than forming gas and moves more slowly through soil.
- **Electrochemical H₂ cells** are more linear and lower-drift, but cost
  several times more and have a limited service life. Worth revisiting for a
  "pro" variant that needs single-digit-ppm sensitivity; the ADC front end
  would need a potentiostat instead of R_L.

## Hardware (circuits/leak_sniffer)

| Block | File | Parts | Notes |
|---|---|---|---|
| USB-C in | `usb_power.py` | J1 USB-C 16P, U7 USBLC6-2SC6, 5.1k CC pull-downs | Charging + native USB (flash/serial) on one port, ESD-protected |
| Power | `power.py` | U2 MCP73831 (500 mA), U3 ME6211 3V3 LDO, Q3 AO3401A, SW1, J2 | Protected 18650 cell. The slide switch only drives Q3's gate: a small SPDT isn't rated for the ~350 mA load |
| 5 V boost | `boost_5v.py` | U4 MT3608, 22 µH, SS34, 73.2k/10k | 4.99 V for the heater (needs 5.0 ±0.2 V) and pump |
| H₂ sensing | `h2_sensor.py` | U8 TGS2616-C01, U5 ADS1115, U6 SHT40, Q1 heater switch | See the front-end section below |
| Pump + alerts | `pump_alert.py` | Q2 + SS34 flyback, J3 pump, BZ1 piezo, D4 status LED | 5 V micro diaphragm pump, PWM speed |
| MCU | `mcu_core.py` | U1 ESP32-S3-WROOM-1, BOOT + ZERO buttons, VBUS detect | BLE, native USB |

**Sensor front end.** V_C = V_H = 5 V from the boost. R_L is two 4.99 kΩ
0.1% resistors in series, and the ADS1115 reads the midpoint. That halves
V_RL, so input AIN0 can never exceed 2.5 V and stays inside the 3.3 V ADC's
range. AIN1 reads V5 through a matched ÷2 divider, so the firmware computes

    Rs = R_L × (AIN1 / AIN0 − 1)

ratiometrically: the ÷2 and any boost-rail drift cancel. Worst-case sensor
power is at Rs = R_L: (2.5 V)² / 9.98 kΩ ≈ 0.63 mW, far under 15 mW. AIN2
reads the cell (÷2). The SHT40 logs temperature and humidity with every
reading, because a metal-oxide sensor's baseline moves with humidity.

**Airflow.** The sensor sits in a small sealed chamber on the board. The
pump pulls air in from the probe tip through a tube, across the sensor, and
out. A fixed flow makes readings repeatable and much faster than passive
diffusion; this is how professional sniffers are built. Probe heads: a bell
(for soil and lawn), a flat carpet/slab probe, and a narrow bar-hole probe.

**GPIO map** (firmware and `mcu_core.py` must match):

| GPIO | Signal | GPIO | Signal |
|---|---|---|---|
| IO8 | SDA | IO5 | PUMP_PWM (20 kHz) |
| IO9 | SCL | IO6 | BOOST_EN |
| IO10 | ADC_RDY | IO7 | BUZZER |
| IO4 | HEATER_EN | IO15 | LED_STATUS |
| IO1 | BTN_ZERO (wake) | IO12 | VBUS_DET |

**Power budget** (estimates, not measured): heater 280 mW + pump ~750 mW,
through an ~85%-efficient boost ≈ 1.2 W, plus the ESP32-S3 on BLE at about
0.2 W. That's ≈ 1.45 W total, so a 2500 mAh 18650 (~9 Wh) gives **roughly
6 hours** of sweeping. The sniffer powers itself down after 30 minutes with
no phone connected and no button press; the button wakes it.

Build the netlist (needs KiCad 8+ symbol libraries):

```bash
cd leak-sniffer
KICAD8_SYMBOL_DIR=/usr/share/kicad/symbols python -m circuits.leak_sniffer
```

Or ask Claude to run `build_circuit leak_sniffer` through the `skidl` MCP
server (`tools/skidl_mcp.py`). Outputs land in `outputs/`.

## Firmware (firmware/leak_sniffer_v1)

Board **ESP32S3 Dev Module**, *USB CDC On Boot: Enabled*, library
**Adafruit ADS1X15**. It compiles clean with `--warnings all` on arduino-esp32
3.3.12.

- **Boot:** boost on, heater on, pump at the default duty, BLE advertising as
  `LeakSniffer-XXXX`.
- **Warm-up:** at least 60 s, then ready once Rs moves less than 0.5% per
  10 s (forced after 5 min). It zeroes itself at that point, so power it up
  in clean air. LED blinks slowly while warming, is solid when ready, and
  blinks fast on a fault.
- **Sampling:** 50 Hz ADC, smoothed, streamed at 10 Hz.
- **Button:** short press marks a point in the web app; hold 1 s to zero.
- **Buzzer:** Geiger-style clicks that speed up and rise in pitch with the
  response, so it's usable without a phone.

**BLE protocol** (service `7a1e0001-3c4b-4f0e-9a51-6c2d8e4b5f10`):

| Characteristic | Props | Format |
|---|---|---|
| READING `7a1e0002-…` | notify, read | 20 bytes LE: `u16 seq, f32 rs_ohm, f32 r0_ohm, u16 ppm (0xFFFF = none), i16 temp×100, u16 rh×100, u16 vbat_mV, u8 state, u8 flags` |
| CONTROL `7a1e0003-…` | write | `01` zero · `02 dd` pump duty · `03 bb` buzzer on/off · `04` calibrate at 100 ppm |

The reading packet is exactly 20 bytes, so it fits the default ATT MTU and
never depends on the phone negotiating a larger one. The dashboard's
`lib/sniffer.ts` mirrors this layout, and a unit test decodes a hand-built
packet at the firmware's offsets.

## Web app (dashboard `/sniffer`)

- **Connect sniffer** uses Web Bluetooth: Chrome/Edge on Android, Windows,
  macOS and ChromeOS. iOS Safari doesn't support Web Bluetooth; use a Web
  Bluetooth browser such as Bluefy there. No WiFi is needed on site. The
  phone only needs data to save points, and a point that fails to save stays
  on screen marked "Not saved".
- **Live gauge** (the same instrument as the fermentation gauges, redline at
  the top only), plus a 60-second trace with the trace (1.15×) and strong
  (1.5×) bands drawn in.
- **Sound** plays the same Geiger clicks through the phone speaker.
- **Survey:** name the job, then mark points. Each point stores response,
  optional label, GPS fix (±accuracy), temperature and RH. Flag suspected
  leaks and follow map links to each point. Recent surveys can be reopened.
- **Try the demo** simulates a sniffer and a buried leak with a probe-position
  slider, so the whole flow can be tried without hardware. Demo points are
  never saved.

## Status and open items

What's verified: the circuit builds with ERC clean, and every footprint name
exists in KiCad 8.0.9's library. The firmware compiles. The migration
applies, and RLS was tested on Postgres 16: owners see only their own
surveys and points, cross-user writes and a spoofed `user_id` are rejected,
signed-out access is denied, and deleting a survey cascades. The web page was
driven in Chromium through both the demo and a simulated Bluetooth sniffer
(connect, stream, zero, the hardware mark button, save, disconnect), and
checked at 375 px with no horizontal scroll.

**Not done yet: nothing has been built or tested on real hardware.** Before
a board run:

- [ ] Check the KiCad `TO-5-4` pad numbering against Figaro's bottom-view
      drawing for U8. The pin circle matches (5.1 mm) but the numbering
      convention must be confirmed.
- [ ] Bench-characterise the TGS2616 with forming gas at known dilutions.
      Tune R_L (9.98 kΩ is a starting point) and the 1.15×/1.5× bands.
- [ ] Measure humidity sensitivity. If needed, add SHT40-based baseline
      compensation in firmware (the data is already streamed).
- [ ] Pick the pump and measure its current. The 350 mA budget assumes
      ~150 mA.
- [ ] MCP73831 isn't a power-path charger: charge with the unit switched off
      so it terminates cleanly. Add a load-sharing charger if charge-while-
      running is needed.
- [ ] Field-test detection depth through soil, paving and a concrete slab.

**Safety:** this is a leak-*locating* aid, not a gas alarm. Use forming gas,
never pure hydrogen. Stay within the pipe's pressure rating. Ventilate
indoor spaces.
