import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Gauge from "../components/Gauge";
import SnifferTrace from "../components/SnifferTrace";
import { supabase } from "../lib/supabaseClient";
import type { GaugeState } from "../lib/gaugeState";
import {
  RESPONSE_GAUGE_MAX,
  peakPoint,
  responseBand,
  responseOf,
  type MarkedPoint,
  type SnifferReading,
} from "../lib/sniffer";
import { bluetoothSupported, useSniffer } from "../lib/useSniffer";
import { useSnifferClicks } from "../lib/useSnifferClicks";
import type { LeakSurvey, LeakSurveyPoint } from "../types/database";

const inputClass = "mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-2 text-panel-200";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-brew-600 px-3 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-panel-600 px-3 text-sm font-medium text-panel-200 hover:bg-panel-800 disabled:opacity-50";

const BAND_STATE: Record<ReturnType<typeof responseBand>, GaugeState> = {
  clean: "nominal",
  trace: "approaching",
  strong: "breached",
};
const BAND_TEXT: Record<ReturnType<typeof responseBand>, string> = {
  clean: "text-panel-400",
  trace: "text-approach-400",
  strong: "text-breach-400",
};

/** A GPS fix older than this isn't where the probe is now. */
const MAX_FIX_AGE_MS = 30_000;

interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
  at: number;
}

interface SurveySummary extends LeakSurvey {
  pointCount: number;
  peakResponse: number | null;
}

function toMarked(p: LeakSurveyPoint): MarkedPoint {
  return {
    id: p.id,
    key: String(p.id),
    label: p.label ?? "",
    response: p.response,
    ppm: p.ppm,
    rsOhm: p.rs_ohm,
    lat: p.lat,
    lng: p.lng,
    accuracyM: p.accuracy_m,
    tempC: p.temp_c,
    rhPct: p.rh_pct,
    suspectedLeak: p.suspected_leak,
    createdAt: p.created_at,
    saveError: null,
  };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Sniffer() {
  const [survey, setSurvey] = useState<LeakSurvey | null>(null);
  const [points, setPoints] = useState<MarkedPoint[]>([]);
  const [recent, setRecent] = useState<SurveySummary[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [nextLabel, setNextLabel] = useState("");
  const [soundOn, setSoundOn] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // markPoint is called from the sniffer's own button via a ref inside
  // useSniffer, so it reads the latest state through refs, not closures.
  const surveyRef = useRef(survey);
  const fixRef = useRef(fix);
  const labelRef = useRef(nextLabel);
  const demoRef = useRef(false);
  useEffect(() => {
    surveyRef.current = survey;
    fixRef.current = fix;
    labelRef.current = nextLabel;
  }, [survey, fix, nextLabel]);

  const markPoint = useCallback(async (reading: SnifferReading) => {
    const response = responseOf(reading);
    const active = surveyRef.current;
    if (response == null || active == null) return;
    const f = fixRef.current && Date.now() - fixRef.current.at <= MAX_FIX_AGE_MS ? fixRef.current : null;
    const label = labelRef.current.trim();
    const createdAt = new Date().toISOString();
    const key = `${createdAt}-${reading.seq}`;
    const point: MarkedPoint = {
      id: null,
      key,
      label,
      response,
      ppm: reading.ppm,
      rsOhm: reading.rsOhm,
      lat: f?.lat ?? null,
      lng: f?.lng ?? null,
      accuracyM: f?.accuracyM ?? null,
      tempC: reading.tempC,
      rhPct: reading.rhPct,
      suspectedLeak: false,
      createdAt,
      // Demo readings aren't real measurements, so they never reach a saved survey.
      saveError: demoRef.current && active.id !== "demo" ? "demo reading" : null,
    };
    setPoints((prev) => [point, ...prev]);
    setNextLabel("");
    if (demoRef.current) return;

    const { data, error } = await supabase
      .from("leak_survey_points")
      .insert({
        survey_id: active.id,
        label: label || null,
        response,
        ppm: reading.ppm,
        rs_ohm: reading.rsOhm,
        lat: point.lat,
        lng: point.lng,
        accuracy_m: point.accuracyM,
        temp_c: reading.tempC,
        rh_pct: reading.rhPct,
      })
      .select("id")
      .single();
    setPoints((prev) =>
      prev.map((p) => (p.key === key ? { ...p, id: data?.id ?? null, saveError: error ? error.message : null } : p)),
    );
  }, []);

  const sniffer = useSniffer(markPoint);
  const isDemo = sniffer.transport === "demo";
  useEffect(() => {
    demoRef.current = isDemo;
  }, [isDemo]);

  const latest = sniffer.latest;
  const response = latest ? responseOf(latest) : null;
  const clicks = useSnifferClicks(latest?.state === "ready" ? response : null, soundOn);

  // Follow the phone's position while a survey is running so a mark doesn't
  // wait on a fresh fix.
  useEffect(() => {
    if (!survey || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy, at: Date.now() });
      },
      (err) => setGeoError(err.message || "Location unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [survey]);

  const loadRecent = useCallback(async () => {
    const { data, error } = await supabase
      .from("leak_surveys")
      .select("id, user_id, name, site_address, notes, sniffer_name, baseline_r0_ohm, created_at, leak_survey_points(response)")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      setRecentError(error.message);
      return;
    }
    setRecentError(null);
    setRecent(
      (data ?? []).map((s) => {
        const { leak_survey_points: pts, ...rest } = s as LeakSurvey & { leak_survey_points: { response: number }[] };
        return { ...rest, pointCount: pts.length, peakResponse: peakPoint(pts)?.response ?? null };
      }),
    );
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  async function startSurvey(e: FormEvent) {
    e.preventDefault();
    setSurveyError(null);
    const name = newName.trim();
    if (!name) return;
    if (isDemo) {
      setSurvey({
        id: "demo", user_id: "", name, site_address: newAddress.trim() || null, notes: null,
        sniffer_name: sniffer.deviceName, baseline_r0_ohm: latest?.r0Ohm ?? null, created_at: new Date().toISOString(),
      });
      setPoints([]);
      return;
    }
    const { data, error } = await supabase
      .from("leak_surveys")
      .insert({
        name,
        site_address: newAddress.trim() || null,
        sniffer_name: sniffer.deviceName,
        baseline_r0_ohm: latest?.r0Ohm ?? null,
      })
      .select("*")
      .single();
    if (error) {
      setSurveyError(error.message);
      return;
    }
    setSurvey(data as LeakSurvey);
    setPoints([]);
    setNewName("");
    setNewAddress("");
  }

  async function resumeSurvey(s: SurveySummary) {
    setSurveyError(null);
    const { data, error } = await supabase
      .from("leak_survey_points")
      .select("*")
      .eq("survey_id", s.id)
      .order("created_at", { ascending: false });
    if (error) {
      setSurveyError(error.message);
      return;
    }
    setSurvey({
      id: s.id, user_id: s.user_id, name: s.name, site_address: s.site_address, notes: s.notes,
      sniffer_name: s.sniffer_name, baseline_r0_ohm: s.baseline_r0_ohm, created_at: s.created_at,
    });
    setPoints((data as LeakSurveyPoint[]).map(toMarked));
  }

  function endSurvey() {
    setSurvey(null);
    setPoints([]);
    void loadRecent();
  }

  async function toggleLeak(p: MarkedPoint) {
    const next = !p.suspectedLeak;
    setPoints((prev) => prev.map((q) => (q.key === p.key ? { ...q, suspectedLeak: next } : q)));
    if (p.id == null) return;
    const { error } = await supabase.from("leak_survey_points").update({ suspected_leak: next }).eq("id", p.id);
    if (error) {
      setPoints((prev) => prev.map((q) => (q.key === p.key ? { ...q, suspectedLeak: !next, saveError: error.message } : q)));
    }
  }

  function toggleSound() {
    if (!soundOn) clicks.unlock();
    setSoundOn((v) => !v);
  }

  const band = response != null ? responseBand(response) : null;
  const gaugeState: GaugeState =
    sniffer.status !== "connected" || latest == null || latest.state === "fault"
      ? "offline"
      : latest.state === "warming" || band == null
        ? "nominal"
        : BAND_STATE[band];
  const peak = peakPoint(points);
  const connected = sniffer.status === "connected";
  const canMark = connected && survey != null && response != null && latest?.state === "ready";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/devices" className="inline-flex min-h-11 items-center text-sm text-panel-400 hover:text-panel-200">
        ← All devices
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold uppercase tracking-wide text-panel-200">Leak sniffer</h1>
        <p className="mt-1 text-sm text-panel-400">
          Tracer-gas water leak location. Fill the drained pipe with 5% hydrogen / 95% nitrogen forming gas, then sweep
          the probe along the pipe run. The reading peaks over the leak.
        </p>
      </header>

      <section aria-label="Sniffer connection" className="mb-6 rounded-lg border border-panel-700 bg-panel-900 p-4">
        {!connected ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void sniffer.connectBluetooth()}
                disabled={!bluetoothSupported() || sniffer.status === "connecting"}
                className={primaryButton}
              >
                {sniffer.status === "connecting" ? "Connecting…" : "Connect sniffer"}
              </button>
              <button onClick={sniffer.startDemo} className={secondaryButton}>
                Try the demo
              </button>
            </div>
            {!bluetoothSupported() && (
              <p className="text-sm text-panel-400">
                This browser can’t reach Bluetooth devices. Use Chrome or Edge on Android, Windows, macOS or ChromeOS.
                On an iPhone, use a Web Bluetooth browser such as Bluefy.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-panel-200">
                {sniffer.deviceName}
                {isDemo && (
                  <span className="ml-2 rounded bg-panel-800 px-1.5 py-0.5 text-xs uppercase tracking-wide text-brew-400">
                    Demo
                  </span>
                )}
              </p>
              <p className="text-panel-400">
                {latest == null
                  ? "Waiting for the first reading…"
                  : latest.state === "warming"
                    ? "Sensor warming up — about a minute. Keep the probe in clean air."
                    : latest.state === "fault"
                      ? "Sensor fault — the sniffer can’t read its gas sensor."
                      : [
                          latest.vbatV != null ? `Battery ${latest.vbatV.toFixed(2)} V` : null,
                          latest.onUsbPower ? "on USB power" : null,
                          latest.tempC != null ? `${latest.tempC.toFixed(1)} °C` : null,
                          latest.rhPct != null ? `${Math.round(latest.rhPct)}% RH` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
              </p>
            </div>
            <button onClick={sniffer.disconnect} className={secondaryButton}>
              Disconnect
            </button>
          </div>
        )}
        {sniffer.error && (
          <p role="alert" className="mt-3 text-sm text-breach-400">
            {sniffer.error}
          </p>
        )}
      </section>

      {connected && (
        <>
          <section
            aria-label="Live reading"
            className="mb-4 flex flex-col items-center gap-4 rounded-lg border border-panel-700 bg-panel-900 p-6 sm:flex-row sm:items-center"
          >
            <Gauge
              value={response}
              min={1}
              max={RESPONSE_GAUGE_MAX}
              displayValue={response != null ? `${response.toFixed(2)}×` : "—"}
              label="H₂"
              state={gaugeState}
              subLabel={latest?.ppm != null ? `${latest.ppm} ppm` : band ? band.toUpperCase() : undefined}
              endLabels={["1×", `${RESPONSE_GAUGE_MAX}×`]}
              size="lg"
              redline="high"
            />
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <button onClick={() => void sniffer.send({ type: "zero" })} className={secondaryButton}>
                Zero in clean air
              </button>
              <button onClick={toggleSound} aria-pressed={soundOn} className={secondaryButton}>
                {soundOn ? "Sound on" : "Sound off"}
              </button>
              <p className="max-w-56 text-xs text-panel-400">
                1.00× is clean air. Zero again if you move between areas with different background air.
              </p>
            </div>
          </section>

          {isDemo && (
            <section aria-label="Demo probe position" className="mb-4 rounded-lg border border-panel-700 bg-panel-900 p-4">
              <label className="block text-sm text-panel-200">
                Probe position along the pipe (demo)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sniffer.demoPosition}
                  onChange={(e) => sniffer.setDemoPosition(Number(e.target.value))}
                  className="mt-2 w-full accent-brew-500"
                />
              </label>
              <p className="mt-1 text-xs text-panel-400">
                Drag to sweep the probe. There’s a simulated leak somewhere along this run.
              </p>
            </section>
          )}

          <div className="mb-8">
            <SnifferTrace trace={sniffer.trace} />
          </div>
        </>
      )}

      <section aria-label="Survey" className="rounded-lg border border-panel-700 bg-panel-900 p-4">
        {survey == null ? (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-panel-200">Start a survey</h2>
            <p className="mt-1 text-sm text-panel-400">
              A survey logs the spots you mark, with the phone’s GPS position, so you can find the peak again.
              {isDemo && " Demo surveys aren’t saved."}
            </p>
            <form onSubmit={(e) => void startSurvey(e)} className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-panel-200">
                Job name
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  maxLength={120}
                  placeholder="e.g. Kitchen slab leak"
                  className={inputClass}
                />
              </label>
              <label className="text-sm text-panel-200">
                Site address (optional)
                <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} maxLength={300} className={inputClass} />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className={primaryButton} disabled={!newName.trim()}>
                  Start survey
                </button>
              </div>
            </form>
            {surveyError && (
              <p role="alert" className="mt-3 text-sm text-breach-400">
                {surveyError}
              </p>
            )}

            <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-panel-200">Recent surveys</h2>
            {recentError ? (
              <p role="alert" className="mt-2 text-sm text-breach-400">
                Couldn’t load your surveys: {recentError}
              </p>
            ) : recent.length === 0 ? (
              <p className="mt-2 text-sm text-panel-400">No surveys yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-panel-700">
                {recent.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0 text-sm">
                      <p className="truncate text-panel-200">{s.name}</p>
                      <p className="text-panel-400">
                        {new Date(s.created_at).toLocaleDateString()} · {s.pointCount} point{s.pointCount === 1 ? "" : "s"}
                        {s.peakResponse != null && ` · peak ${s.peakResponse.toFixed(2)}×`}
                      </p>
                    </div>
                    <button onClick={() => void resumeSurvey(s)} className={secondaryButton}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-sm font-semibold uppercase tracking-wide text-panel-200">{survey.name}</h2>
                {survey.site_address && <p className="text-sm text-panel-400">{survey.site_address}</p>}
              </div>
              <button onClick={endSurvey} className={secondaryButton}>
                Close survey
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm text-panel-200">
                Label for the next point (optional)
                <input
                  value={nextLabel}
                  onChange={(e) => setNextLabel(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. 2m from the geyser"
                  className={inputClass}
                />
              </label>
              <button
                onClick={() => latest && void markPoint(latest)}
                disabled={!canMark}
                className={primaryButton}
              >
                Mark point
              </button>
            </div>
            <p className="mt-1 text-xs text-panel-400">
              {!connected
                ? "Connect the sniffer to mark points."
                : "Or press the button on the sniffer."}{" "}
              {geoError
                ? `No GPS: ${geoError}. Points will save without a position.`
                : fix
                  ? `GPS ±${Math.round(fix.accuracyM)} m.`
                  : "Waiting for GPS…"}
            </p>

            {points.length === 0 ? (
              <p className="mt-4 text-sm text-panel-400">No points yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-panel-400">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 pr-3 font-medium">Response</th>
                      <th className="py-2 pr-3 font-medium">Where</th>
                      <th className="py-2 font-medium">Leak?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-panel-700">
                    {points.map((p) => (
                      <tr key={p.key} className={p === peak ? "bg-panel-800" : undefined}>
                        <td className="py-2 pr-3 align-top text-panel-400">
                          {formatTime(p.createdAt)}
                          {p === peak && points.length > 1 && (
                            <span className="block text-xs font-medium uppercase text-brew-400">Peak</span>
                          )}
                        </td>
                        <td className={`py-2 pr-3 align-top font-gauge ${BAND_TEXT[responseBand(p.response)]}`}>
                          {p.response.toFixed(2)}×{p.ppm != null && <span className="block text-xs">{p.ppm} ppm</span>}
                        </td>
                        <td className="py-2 pr-3 align-top text-panel-200">
                          {p.label && <span className="block">{p.label}</span>}
                          {p.lat != null && p.lng != null ? (
                            <a
                              href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brew-400 underline"
                            >
                              Map (±{Math.round(p.accuracyM ?? 0)} m)
                            </a>
                          ) : (
                            <span className="text-panel-400">No GPS</span>
                          )}
                          {p.saveError && <span className="block text-xs text-breach-400">Not saved: {p.saveError}</span>}
                        </td>
                        <td className="py-2 align-top">
                          <input
                            type="checkbox"
                            checked={p.suspectedLeak}
                            onChange={() => void toggleLeak(p)}
                            aria-label={`Mark the ${formatTime(p.createdAt)} point as a suspected leak`}
                            className="h-5 w-5 accent-breach-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
