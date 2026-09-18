import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import type { DeviceType, FirmwareRelease } from "../types/database";

const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
  { value: "hub", label: "Hub" },
  { value: "tilt", label: "Temp + Gravity" },
];

function manifestPath(deviceType: DeviceType) {
  return `${deviceType}/manifest.json`;
}

function binPath(deviceType: DeviceType, version: number) {
  return `${deviceType}/v${version}.bin`;
}

interface SectionState {
  file: File | null;
  version: string;
  notes: string;
  uploading: boolean;
  error: string | null;
}

const emptySection: SectionState = { file: null, version: "", notes: "", uploading: false, error: null };

export default function AdminFirmware() {
  const { session } = useAuth();
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<DeviceType, SectionState>>({
    hub: emptySection,
    tilt: emptySection,
    co2: emptySection,
  });
  // Distinct per release id so publishing one doesn't disable every button.
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    loadReleases();
  }, []);

  async function loadReleases() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("firmware_releases")
      .select("*")
      .order("device_type", { ascending: true })
      .order("version", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setReleases((data as FirmwareRelease[]) ?? []);
    setLoading(false);
  }

  function setSection(type: DeviceType, patch: Partial<SectionState>) {
    setSections((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  async function handleUpload(type: DeviceType) {
    const section = sections[type];
    setSection(type, { error: null });

    if (!section.file) {
      setSection(type, { error: "Choose a .bin file first." });
      return;
    }
    const version = Number(section.version);
    if (!Number.isInteger(version) || version <= 0) {
      setSection(type, { error: "Version must be a positive whole number, matching FIRMWARE_VERSION in the sketch." });
      return;
    }

    setSection(type, { uploading: true });

    const path = binPath(type, version);
    // upsert: false -- a version number is immutable once uploaded. Fixing a
    // bad build means bumping the version and uploading again, not silently
    // overwriting a binary that a device's manifest URL might already point
    // to mid-download.
    const { error: uploadError } = await supabase.storage
      .from("firmware")
      .upload(path, section.file, { contentType: "application/octet-stream", upsert: false });

    if (uploadError) {
      setSection(type, { uploading: false, error: uploadError.message });
      return;
    }

    const { error: insertError } = await supabase.from("firmware_releases").insert({
      device_type: type,
      version,
      storage_path: path,
      notes: section.notes.trim() || null,
      created_by: session?.user.id,
    });

    setSection(type, { uploading: false });

    if (insertError) {
      setSection(type, { error: insertError.message });
      return;
    }

    setSection(type, { ...emptySection });
    const input = fileInputRefs.current[type];
    if (input) input.value = "";
    loadReleases();
  }

  async function handlePublish(release: FirmwareRelease) {
    setPublishError(null);
    setPublishingId(release.id);

    const { data: urlData } = supabase.storage.from("firmware").getPublicUrl(release.storage_path);
    const manifest = JSON.stringify({ version: release.version, url: urlData.publicUrl });
    const manifestBlob = new Blob([manifest], { type: "application/json" });

    // Write the manifest first -- this is the object devices actually poll.
    // Only record it as "published" in our own bookkeeping once that write
    // has actually succeeded; the reverse order could show "published" in
    // this console while devices are still fetching the old manifest.
    const { error: manifestError } = await supabase.storage
      .from("firmware")
      .upload(manifestPath(release.device_type), manifestBlob, { contentType: "application/json", upsert: true });

    if (manifestError) {
      setPublishingId(null);
      setPublishError(`Manifest write failed -- devices still on the previous version: ${manifestError.message}`);
      return;
    }

    const { error: rpcError } = await supabase.rpc("publish_firmware_release", { p_release_id: release.id });
    setPublishingId(null);

    if (rpcError) {
      // The manifest write above already succeeded, so devices ARE getting
      // this version -- only this console's bookkeeping is stale. Say so
      // rather than implying the publish itself failed.
      setPublishError(
        `Live on devices, but couldn't record it here: ${rpcError.message}. Retry publish to fix the record -- it'll just rewrite the same manifest.`,
      );
      return;
    }

    loadReleases();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/devices" className="text-sm text-panel-400 hover:text-panel-200">
        ← All devices
      </Link>

      <h1 className="mt-2 mb-1 text-2xl font-semibold uppercase tracking-wide text-panel-200">Firmware</h1>
      <p className="mb-6 text-sm text-panel-400">
        Publishing here rewrites the public <code className="rounded bg-panel-800 px-1">manifest.json</code> each
        device type's OTA check polls — see <code className="rounded bg-panel-800 px-1">checkForOTAUpdate()</code> in
        the firmware. Nothing here pushes to a device directly; it takes up to a device's own OTA check interval
        (once/day by default) to pick up a newly published version.
      </p>

      {loadError && (
        <div className="mb-6 rounded-lg border border-breach-500/40 bg-panel-900 p-4">
          <p className="text-sm font-medium text-breach-400">Couldn't load releases</p>
          <p className="mt-1 text-sm text-panel-400">{loadError}</p>
          <button
            onClick={loadReleases}
            className="mt-2 rounded-md border border-breach-500/50 px-3 py-2 text-sm font-medium text-breach-400 hover:bg-panel-800"
          >
            Retry
          </button>
        </div>
      )}

      {publishError && (
        <div className="mb-6 rounded-lg border border-approach-500/40 bg-panel-900 p-4 text-sm text-approach-400">
          {publishError}
        </div>
      )}

      {loading ? (
        <p className="text-panel-400">Loading…</p>
      ) : (
        <div className="space-y-8">
          {DEVICE_TYPES.map(({ value: type, label }) => {
            const typeReleases = releases.filter((r) => r.device_type === type);
            const current = typeReleases.find((r) => r.published);
            const section = sections[type];

            return (
              <section key={type} className="rounded-lg border border-panel-700 bg-panel-900 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-panel-400">{label}</h2>

                {current ? (
                  <p className="mt-2 text-sm text-panel-200">
                    Current: <span className="font-gauge tabular text-brew-400">v{current.version}</span>
                    {current.notes && <span className="text-panel-400"> — {current.notes}</span>}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-panel-400">Nothing published yet for this type.</p>
                )}

                <div className="mt-4 space-y-2 rounded-md border border-panel-700 bg-panel-950 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-panel-400">Upload a build</p>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[type] = el;
                    }}
                    type="file"
                    accept=".bin"
                    onChange={(e) => setSection(type, { file: e.target.files?.[0] ?? null })}
                    className="block w-full text-sm text-panel-200 file:mr-3 file:rounded-md file:border file:border-panel-600 file:bg-panel-900 file:px-2 file:py-1 file:text-panel-200"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-sm text-panel-200">
                      Version
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={section.version}
                        onChange={(e) => setSection(type, { version: e.target.value })}
                        placeholder="Matches FIRMWARE_VERSION in the sketch"
                        className="mt-1 w-full rounded-md border border-panel-600 bg-panel-900 px-2 py-1 text-panel-200"
                      />
                    </label>
                    <label className="text-sm text-panel-200">
                      Notes (optional)
                      <input
                        type="text"
                        value={section.notes}
                        onChange={(e) => setSection(type, { notes: e.target.value })}
                        placeholder="What changed"
                        className="mt-1 w-full rounded-md border border-panel-600 bg-panel-900 px-2 py-1 text-panel-200"
                      />
                    </label>
                  </div>
                  {section.error && <p className="text-sm text-breach-400">{section.error}</p>}
                  <button
                    onClick={() => handleUpload(type)}
                    disabled={section.uploading}
                    className="rounded-md border border-panel-600 px-3 py-2 text-sm font-medium text-panel-200 hover:bg-panel-800 disabled:opacity-50"
                  >
                    {section.uploading ? "Uploading…" : "Upload"}
                  </button>
                </div>

                {typeReleases.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-panel-400">History</p>
                    {typeReleases.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-panel-700 bg-panel-950 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-gauge tabular text-panel-200">v{r.version}</span>
                          <span className="ml-2 text-xs text-panel-400">
                            {new Date(r.created_at).toLocaleString()}
                          </span>
                          {r.notes && <p className="text-xs text-panel-400">{r.notes}</p>}
                        </div>
                        {r.published ? (
                          <span className="shrink-0 rounded bg-panel-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brew-400">
                            Published
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePublish(r)}
                            disabled={publishingId === r.id}
                            className="shrink-0 rounded-md bg-brew-600 px-3 py-2 text-sm font-medium text-white hover:bg-brew-500 disabled:opacity-50"
                          >
                            {publishingId === r.id ? "Publishing…" : "Publish"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
