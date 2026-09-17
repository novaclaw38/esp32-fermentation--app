import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDevice } from "../lib/useDevice";
import type { Device } from "../types/database";
import DeviceProfileForm from "../components/settings/DeviceProfileForm";
import ThresholdForm from "../components/ThresholdForm";
import CalibrationForm from "../components/CalibrationForm";
import SnoozeForm from "../components/settings/SnoozeForm";
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

export default function DeviceSettings() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { device, setDevice, loading, notFound, loadError, reload } = useDevice(deviceId);
  const [tab, setTab] = useState<Tab>("profile");

  function handleDeviceFieldSaved(updates: Partial<Device>) {
    setDevice((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  if (loading) {
    return <div className="p-8 text-panel-400">Loading…</div>;
  }

  if (loadError) {
    return (
      <div className="p-8">
        <p className="font-medium text-breach-400">Couldn't load this device</p>
        <p className="mt-1 text-sm text-panel-400">{loadError}</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={reload}
            className="rounded-md border border-breach-500/50 px-3 py-1.5 text-sm font-medium text-breach-400 hover:bg-panel-800"
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to={`/devices/${device.id}`} className="text-sm text-panel-400 hover:text-panel-200">
        ← {device.name}
      </Link>

      <h1 className="mt-2 mb-6 text-2xl font-semibold uppercase tracking-wide text-panel-200">Settings</h1>

      <div className="mb-6 flex gap-1 border-b border-panel-700">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium uppercase tracking-wide transition-colors ${
              tab === t
                ? "border-brew-400 text-brew-400"
                : "border-transparent text-panel-400 hover:text-panel-200"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-6">
          <DeviceProfileForm device={device} onSaved={handleDeviceFieldSaved} />
        </div>
      )}

      {tab === "setup" && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-panel-400">
              Alert thresholds
            </h3>
            <ThresholdForm device={device} onSaved={handleDeviceFieldSaved} />
          </section>

          {showGravity && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-panel-400">
                Gravity calibration
              </h3>
              <CalibrationForm device={device} onSaved={handleDeviceFieldSaved} />
            </section>
          )}
        </div>
      )}

      {tab === "tools" && (
        <div className="space-y-6">
          <SnoozeForm device={device} onSaved={handleDeviceFieldSaved} />
          <UnclaimDeviceForm device={device} onUnclaimed={() => navigate("/devices")} />
        </div>
      )}

      {tab === "data" && (
        <div className="space-y-6">
          <NotifyEmailToggle device={device} onSaved={handleDeviceFieldSaved} />
          <RemoveDeviceForm device={device} onDeleted={() => navigate("/devices")} />
        </div>
      )}
    </div>
  );
}
