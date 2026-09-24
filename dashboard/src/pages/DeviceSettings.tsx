import { useRef, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDevice } from "../lib/useDevice";
import type { Device } from "../types/database";
import DeviceProfileForm from "../components/settings/DeviceProfileForm";
import ThresholdForm from "../components/ThresholdForm";
import CalibrationForm from "../components/CalibrationForm";
import SnoozeForm from "../components/settings/SnoozeForm";
import BatchForm from "../components/settings/BatchForm";
import UnclaimDeviceForm from "../components/settings/UnclaimDeviceForm";
import NotifyEmailToggle from "../components/settings/NotifyEmailToggle";
import RemoveDeviceForm from "../components/settings/RemoveDeviceForm";
import { isTiltDevice } from "../lib/gravity";

const TABS = ["profile", "setup", "tools", "data"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  profile: "Profile",
  setup: "Setup",
  tools: "Tools",
  data: "Data",
};

function isTab(value: string | null): value is Tab {
  return value != null && (TABS as readonly string[]).includes(value);
}

const subheading = "mb-2 text-base font-semibold text-panel-200";

export default function DeviceSettings() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { device, setDevice, loading, notFound, loadError, reload } = useDevice(deviceId);
  // The tab lives in the URL: a reload keeps your place, and other pages can
  // link straight to one (the gravity chart links to ?tab=setup).
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: Tab = isTab(requested) ? requested : "profile";
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ profile: null, setup: null, tools: null, data: null });

  function selectTab(next: Tab, focus = false) {
    setSearchParams(next === "profile" ? {} : { tab: next }, { replace: true });
    if (focus) tabRefs.current[next]?.focus();
  }

  // WAI-ARIA tabs pattern: arrows move between tabs, Home/End jump to the ends.
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length]
      : e.key === "ArrowLeft" ? TABS[(i - 1 + TABS.length) % TABS.length]
      : e.key === "Home" ? TABS[0]
      : e.key === "End" ? TABS[TABS.length - 1]
      : null;
    if (next) {
      e.preventDefault();
      selectTab(next, true);
    }
  }

  function handleDeviceFieldSaved(updates: Partial<Device>) {
    setDevice((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  if (loading) {
    return (
      <p role="status" className="p-8 text-panel-400">
        Loading…
      </p>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="p-8">
        <p className="font-medium text-breach-400">Couldn't load this device</p>
        <p className="mt-1 text-sm text-panel-400">{loadError}</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={reload}
            className="min-h-11 rounded-md border border-breach-500/50 px-3 py-2 text-sm font-medium text-breach-400 hover:bg-panel-800"
          >
            Retry
          </button>
          <Link to="/devices" className="text-sm text-brew-400 underline">
            Back to devices
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !device) {
    return (
      <div className="p-8">
        <p className="text-panel-400">Device not found.</p>
        <Link to="/devices" className="text-brew-400 underline">
          Back to devices
        </Link>
      </div>
    );
  }

  const showGravity = isTiltDevice(device);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to={`/devices/${device.id}`}
        className="inline-flex min-h-11 items-center text-sm text-panel-400 hover:text-panel-200"
      >
        ← {device.name}
      </Link>

      <h1 className="mt-2 mb-6 text-2xl font-semibold text-panel-200">Settings</h1>

      <div role="tablist" aria-label="Device settings" className="mb-6 flex overflow-x-auto border-b border-panel-700">
        {TABS.map((t) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            id={`tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => selectTab(t)}
            onKeyDown={onTabKeyDown}
            className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium transition-colors ${
              tab === t ? "border-brew-400 text-brew-400" : "border-transparent text-panel-400 hover:text-panel-200"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-6">
        {tab === "profile" && (
          <section>
            <h2 className={subheading}>Device</h2>
            <DeviceProfileForm device={device} onSaved={handleDeviceFieldSaved} />
          </section>
        )}

        {tab === "setup" && (
          <>
            <section>
              <h2 className={subheading}>Alert thresholds</h2>
              <ThresholdForm device={device} onSaved={handleDeviceFieldSaved} />
            </section>

            {showGravity && (
              <section>
                <h2 className={subheading}>Gravity calibration</h2>
                <CalibrationForm device={device} onSaved={handleDeviceFieldSaved} />
              </section>
            )}

            {showGravity && (
              <section>
                <h2 className={subheading}>Batch</h2>
                <BatchForm device={device} onSaved={handleDeviceFieldSaved} />
              </section>
            )}
          </>
        )}

        {tab === "tools" && (
          <>
            <section>
              <h2 className={subheading}>Snooze alerts</h2>
              <SnoozeForm device={device} onSaved={handleDeviceFieldSaved} />
            </section>
            <section>
              <h2 className={subheading}>Ownership</h2>
              <UnclaimDeviceForm device={device} onUnclaimed={() => navigate("/devices")} />
            </section>
          </>
        )}

        {tab === "data" && (
          <>
            <section>
              <h2 className={subheading}>Notifications</h2>
              <NotifyEmailToggle device={device} onSaved={handleDeviceFieldSaved} />
            </section>
            <section>
              <h2 className={subheading}>Danger zone</h2>
              <RemoveDeviceForm device={device} onDeleted={() => navigate("/devices")} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
